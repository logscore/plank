import { DEFAULT_COLORS } from './colors';
import { stringHash } from './hash';

// ============================================================================
// Types
// ============================================================================

export type Variant = 'gradient' | 'solid';
export type Intensity3D = 'none' | 'subtle' | 'medium' | 'dramatic';
export type FaceType = 'round' | 'cross' | 'line' | 'curved';

export const FACE_TYPES = ['round', 'cross', 'line', 'curved'] as const;

export interface FacehashData {
	/** The face type to render */
	faceType: FaceType;
	/** Index into the colors array */
	colorIndex: number;
	/** Rotation position for 3D effect (-1, 0, or 1 for each axis) */
	rotation: { x: number; y: number };
	/** First letter of the name, uppercase */
	initial: string;
	/** Blink animation timings */
	blinkTimings: {
		left: { delay: number; duration: number };
		right: { delay: number; duration: number };
	};
}

// ============================================================================
// Constants
// ============================================================================

const SPHERE_POSITIONS = [
	{ x: -1, y: 1 }, // down-right
	{ x: 1, y: 1 }, // up-right
	{ x: 1, y: 0 }, // up
	{ x: 0, y: 1 }, // right
	{ x: -1, y: 0 }, // down
	{ x: 0, y: 0 }, // center
	{ x: 0, y: -1 }, // left
	{ x: -1, y: -1 }, // down-left
	{ x: 1, y: -1 }, // up-left
] as const;

export const INTENSITY_PRESETS = {
	none: {
		rotateRange: 0,
		translateZ: 0,
		perspective: 'none',
	},
	subtle: {
		rotateRange: 5,
		translateZ: 4,
		perspective: '800px',
	},
	medium: {
		rotateRange: 10,
		translateZ: 8,
		perspective: '500px',
	},
	dramatic: {
		rotateRange: 15,
		translateZ: 12,
		perspective: '300px',
	},
} as const;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Computes deterministic face properties from a name string.
 * Pure function with no side effects.
 */
export function computeFacehash(name: string, colorsLength: number = DEFAULT_COLORS.length): FacehashData {
	const hash = stringHash(name);
	const faceIndex = hash % FACE_TYPES.length;
	const colorIndex = hash % colorsLength;
	const positionIndex = hash % SPHERE_POSITIONS.length;
	const position = SPHERE_POSITIONS[positionIndex] ?? { x: 0, y: 0 };

	// Generate blink timings using hash
	const blinkSeed = hash * 31;
	const blinkDelay = (blinkSeed % 40) / 10; // 0-4s
	const blinkDuration = 2 + (blinkSeed % 40) / 10; // 2-6s
	const timing = { delay: blinkDelay, duration: blinkDuration };

	return {
		faceType: FACE_TYPES[faceIndex] ?? 'round',
		colorIndex,
		rotation: position,
		initial: name.charAt(0).toUpperCase(),
		blinkTimings: {
			left: timing,
			right: timing,
		},
	};
}

const FALLBACK_COLOR = '#ec4899'; // pink-500

/**
 * Gets a color from an array by index, with fallback to default colors.
 */
export function getColor(colors: readonly string[] | undefined, index: number): string {
	const palette = colors && colors.length > 0 ? colors : DEFAULT_COLORS;
	return palette[index % palette.length] ?? FALLBACK_COLOR;
}
