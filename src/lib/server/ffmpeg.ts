import type { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Supported video containers that browsers can play natively
const NATIVE_PLAYABLE = ['.mp4', '.webm'];

// Supported containers that need transmuxing (container change, no re-encoding)
const TRANSMUXABLE = ['.mkv', '.avi', '.mov', '.m4v'];

// All supported video formats
export const SUPPORTED_VIDEO_FORMATS = [...NATIVE_PLAYABLE, ...TRANSMUXABLE];

export function needsTransmux(fileName: string): boolean {
	const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
	return TRANSMUXABLE.includes(ext);
}

export function isSupportedFormat(fileName: string): boolean {
	const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
	return SUPPORTED_VIDEO_FORMATS.includes(ext);
}

interface TransmuxOptions {
	inputStream: Readable;
	start?: number;
	onError?: (err: Error) => void;
}

export function createTransmuxStream(options: TransmuxOptions): Readable {
	const { inputStream, start, onError } = options;
	const outputStream = new PassThrough();

	const command = ffmpeg(inputStream)
		.inputFormat('matroska') // Force MKV input format
		.outputFormat('mp4')
		.outputOptions([
			'-movflags',
			'frag_keyframe+empty_moov+faststart', // Enable streaming
			'-c:v',
			'copy', // Copy video stream (no re-encoding)
			'-c:a',
			'aac', // Transcode audio to AAC for browser compatibility
			'-b:a',
			'192k',
		]);

	if (start && start > 0) {
		command.setStartTime(start);
	}

	command
		// .on('start', (cmd) => {
		// 	console.log('[Transcoder] Starting FFmpeg:', cmd);
		// })
		.on('error', (err: Error, _stdout, stderr) => {
			console.error('[Transcoder] FFmpeg error:', err.message);
			if (stderr) {
				console.error('[Transcoder] FFmpeg stderr:', stderr);
			}
			if (onError) {
				onError(err);
			}
			outputStream.destroy(err);
		})
		// .on('end', () => {
		// 	console.log('[Transcoder] FFmpeg finished');
		// })
		.pipe(outputStream, { end: true });

	return outputStream;
}

/**
 * Transmux a file from one format to another (typically MKV to MP4)
 */
export async function transmuxFile(inputPath: string, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.output(outputPath)
			.outputOptions([
				'-movflags',
				'+faststart', // Optimize for web streaming
				'-c:v',
				'copy', // Copy video stream (no re-encoding)
				'-c:a',
				'aac', // Transcode audio to AAC for browser compatibility
				'-b:a',
				'192k',
			])
			.on('error', (err: Error) => {
				console.error('[Transcoder] Transmux error:', err.message);
				reject(err);
			})
			.on('end', () => {
				resolve();
			})
			.run();
	});
}

// Subtitle formats that cannot be converted to text-based VTT
const BITMAP_SUBTITLE_CODECS = ['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle'];

export interface SubtitleStreamInfo {
	index: number;
	language: string;
	title: string;
	codec: string;
	isDefault: boolean;
	isForced: boolean;
}

export async function probeSubtitleStreams(filePath: string): Promise<SubtitleStreamInfo[]> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}

			const streams = metadata.streams
				.filter((s) => s.codec_type === 'subtitle')
				.filter((s) => !BITMAP_SUBTITLE_CODECS.includes(s.codec_name ?? ''))
				.map((s, i) => ({
					index: s.index,
					language: s.tags?.language ?? 'und',
					title: s.tags?.title ?? `Track ${i + 1}`,
					codec: s.codec_name ?? 'unknown',
					isDefault: s.disposition?.default === 1,
					isForced: s.disposition?.forced === 1,
				}));

			resolve(streams);
		});
	});
}

export async function extractSubtitleAsVtt(inputPath: string, streamIndex: number, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.outputOptions(['-map', `0:${streamIndex}`, '-c:s', 'webvtt'])
			.output(outputPath)
			.on('error', (err: Error) => {
				reject(err);
			})
			.on('end', () => {
				resolve();
			})
			.run();
	});
}

export async function convertSubtitleToVtt(inputPath: string, outputPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.outputOptions(['-c:s', 'webvtt'])
			.output(outputPath)
			.on('error', (err: Error) => {
				reject(err);
			})
			.on('end', () => {
				resolve();
			})
			.run();
	});
}

// Probe a file to get its codec information
export async function probeFile(filePath: string): Promise<{
	videoCodec: string | null;
	audioCodec: string | null;
	duration: number | null;
	width: number | null;
	height: number | null;
}> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}

			const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
			const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

			resolve({
				videoCodec: videoStream?.codec_name || null,
				audioCodec: audioStream?.codec_name || null,
				duration: metadata.format.duration || null,
				width: videoStream?.width || null,
				height: videoStream?.height || null,
			});
		});
	});
}
