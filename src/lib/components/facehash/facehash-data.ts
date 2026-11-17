import { DEFAULT_COLORS } from "./colors";
import { stringHash } from "./hash";

// ============================================================================
// Types
// ============================================================================

export type Variant = "gradient" | "solid";
export type Intensity3D = "none" | "subtle" | "medium" | "dramatic";
type FaceType = "round" | "cross" | "line" | "curved";

const FACE_TYPES = ["round", "cross", "line", "curved"] as const;

export interface FacehashData {
	/** Blink animation timings */
	blinkTimings: {
		left: { delay: number; duration: number };
		right: { delay: number; duration: number };
	};
	/** Index into the colors array */
	colorIndex: number;
	/** The face type to render */
	faceType: FaceType;
	/** First letter of the name, uppercase */
	initial: string;
	/** Rotation position for 3D effect (-1, 0, or 1 for each axis) */
	rotation: { x: number; y: number };
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
	dramatic: {
		perspective: "300px",
		rotateRange: 15,
		translateZ: 12,
	},
	medium: {
		perspective: "500px",
		rotateRange: 10,
		translateZ: 8,
	},
	none: {
		perspective: "none",
		rotateRange: 0,
		translateZ: 0,
	},
	subtle: {
		perspective: "800px",
		rotateRange: 5,
		translateZ: 4,
	},
} as const;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Computes deterministic face properties from a name string.
 * Pure function with no side effects.
 */
export function computeFacehash(name: string): FacehashData {
	const hash = stringHash(name);
	const faceIndex = hash % FACE_TYPES.length;
	const colorIndex = hash % DEFAULT_COLORS.length;
	const positionIndex = hash % SPHERE_POSITIONS.length;
	const position = SPHERE_POSITIONS[positionIndex] ?? { x: 0, y: 0 };

	// Generate blink timings using hash
	const blinkSeed = hash * 31;
	const blinkDelay = (blinkSeed % 40) / 10; // 0-4s
	const blinkDuration = 2 + (blinkSeed % 40) / 10; // 2-6s
	const timing = { delay: blinkDelay, duration: blinkDuration };

	return {
		blinkTimings: {
			left: timing,
			right: timing,
		},
		colorIndex,
		faceType: FACE_TYPES[faceIndex] ?? "round",
		initial: name.charAt(0).toUpperCase(),
		rotation: position,
	};
}

const FALLBACK_COLOR = "#ec4899"; // pink-500

/**
 * Gets a color from the default palette, with a fallback.
 */
export function getColor(index: number): string {
	return DEFAULT_COLORS[index % DEFAULT_COLORS.length] ?? FALLBACK_COLOR;
}
