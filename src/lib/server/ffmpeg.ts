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
	fileName?: string;
	onError?: (err: Error) => void;
}

const BROWSER_SAFE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const BROWSER_SAFE_AUDIO_CODECS = new Set(['aac', 'mp3', 'opus', 'vorbis']);

const INPUT_FORMAT_BY_EXTENSION: Record<string, string> = {
	'.avi': 'avi',
	'.m4v': 'mp4',
	'.mkv': 'matroska',
	'.mov': 'mov',
	'.mp4': 'mp4',
	'.webm': 'webm',
};

function getInputFormat(fileName?: string): string | null {
	if (!fileName) {
		return null;
	}
	const extension = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
	return INPUT_FORMAT_BY_EXTENSION[extension] ?? null;
}

export function createTransmuxStream(options: TransmuxOptions): Readable {
	const { inputStream, start, fileName, onError } = options;
	const outputStream = new PassThrough();
	const command = ffmpeg(inputStream)
		.outputFormat('mp4')
		.inputOptions(['-fflags', '+genpts', '-analyzeduration', '100M', '-probesize', '100M'])
		.outputOptions([
			'-map',
			'0:v:0',
			'-map',
			'0:a:0?',
			'-dn',
			'-sn',
			'-movflags',
			'frag_keyframe+empty_moov+default_base_moof+faststart',
			'-c:v',
			'copy', // Copy video stream (no re-encoding)
			'-c:a',
			'aac', // Transcode audio to AAC for browser compatibility
			'-ac',
			'2',
			'-b:a',
			'192k',
		]);

	const inputFormat = getInputFormat(fileName);
	if (inputFormat) {
		command.inputFormat(inputFormat);
	}

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
				'-map',
				'0:v:0',
				'-map',
				'0:a:0?',
				'-dn',
				'-sn',
				'-movflags',
				'+faststart', // Optimize for web streaming
				'-c:v',
				'copy', // Copy video stream (no re-encoding)
				'-c:a',
				'aac', // Transcode audio to AAC for browser compatibility
				'-ac',
				'2',
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
	audioChannels: number | null;
	hasDataStreams: boolean;
}> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}

			const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
			const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
			const hasDataStreams = metadata.streams.some((stream) => stream.codec_type === 'data');

			resolve({
				videoCodec: videoStream?.codec_name || null,
				audioCodec: audioStream?.codec_name || null,
				duration: metadata.format.duration || null,
				width: videoStream?.width || null,
				height: videoStream?.height || null,
				audioChannels: audioStream?.channels || null,
				hasDataStreams,
			});
		});
	});
}

export interface PlaybackCompatibility {
	videoCodec: string | null;
	audioCodec: string | null;
	audioChannels: number | null;
	hasDataStreams: boolean;
	needsVideoTranscode: boolean;
	needsAudioNormalization: boolean;
	needsDataCleanup: boolean;
	requiresNormalization: boolean;
}

export async function getPlaybackCompatibility(filePath: string): Promise<PlaybackCompatibility> {
	const probe = await probeFile(filePath);
	const needsVideoTranscode = !(probe.videoCodec && BROWSER_SAFE_VIDEO_CODECS.has(probe.videoCodec));
	const needsAudioNormalization =
		(probe.audioCodec !== null && !BROWSER_SAFE_AUDIO_CODECS.has(probe.audioCodec)) ||
		(probe.audioChannels ?? 0) > 2;
	const needsDataCleanup = probe.hasDataStreams;
	return {
		videoCodec: probe.videoCodec,
		audioCodec: probe.audioCodec,
		audioChannels: probe.audioChannels,
		hasDataStreams: probe.hasDataStreams,
		needsVideoTranscode,
		needsAudioNormalization,
		needsDataCleanup,
		requiresNormalization: needsVideoTranscode || needsAudioNormalization || needsDataCleanup,
	};
}

export async function requiresBrowserSafePlayback(filePath: string): Promise<boolean> {
	return (await getPlaybackCompatibility(filePath)).requiresNormalization;
}

export async function normalizeFileForPlayback(inputPath: string, outputPath: string): Promise<void> {
	const compatibility = await getPlaybackCompatibility(inputPath);
	return new Promise((resolve, reject) => {
		const command = ffmpeg(inputPath)
			.output(outputPath)
			.outputOptions([
				'-map',
				'0:v:0',
				'-map',
				'0:a:0?',
				'-dn',
				'-sn',
				'-movflags',
				'+faststart',
				'-c:a',
				'aac',
				'-ac',
				'2',
				'-b:a',
				'192k',
			]);

		if (compatibility.needsVideoTranscode) {
			command.outputOptions(['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p']);
		} else {
			command.outputOptions(['-c:v', 'copy']);
		}

		command
			.on('error', (err: Error) => {
				console.error('[Transcoder] Normalize error:', err.message);
				reject(err);
			})
			.on('end', () => {
				resolve();
			})
			.run();
	});
}
