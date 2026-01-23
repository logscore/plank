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
