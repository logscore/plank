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

export function isNativePlayable(fileName: string): boolean {
	const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
	return NATIVE_PLAYABLE.includes(ext);
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

// Check if video codec is browser-compatible
export function isBrowserCompatibleCodec(codec: string | null): boolean {
	if (!codec) {
		return false;
	}
	const compatibleCodecs = ['h264', 'avc1', 'vp8', 'vp9', 'av1'];
	return compatibleCodecs.includes(codec.toLowerCase());
}
