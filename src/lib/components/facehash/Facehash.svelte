<script lang="ts">
    import { cn } from '$lib/utils';
    import CrossFace from './CrossFace.svelte';
    import CurvedFace from './CurvedFace.svelte';
    import { DEFAULT_COLORS } from './colors';
    import type { Intensity3D, Variant } from './facehash-data';
    import { computeFacehash, getColor, INTENSITY_PRESETS } from './facehash-data';
    import LineFace from './LineFace.svelte';
    import RoundFace from './RoundFace.svelte';

    let {
        name,
        size = 40,
        variant = 'gradient',
        intensity3d = 'dramatic',
        interactive = true,
        showInitial = true,
        colors,
        enableBlink = false,
        class: className = '',
    }: {
        /** String to generate a deterministic face from. Same string always produces the same face. */
        name: string;
        /** Size in pixels or CSS units. */
        size?: number | string;
        /** Background style. */
        variant?: Variant;
        /** 3D effect intensity. */
        intensity3d?: Intensity3D;
        /** Enable hover interaction. When true, face "looks straight" on hover. */
        interactive?: boolean;
        /** Show first letter of name below the face. */
        showInitial?: boolean;
        /** Hex color array for background. */
        colors?: string[];
        /** Enable random eye blinking animation. */
        enableBlink?: boolean;
        /** Additional CSS class. */
        class?: string;
    } = $props();

    let isHovered = $state(false);

    // Compute deterministic face data from name
    const colorsLength = $derived(colors?.length ?? DEFAULT_COLORS.length);
    const faceData = $derived(computeFacehash(name, colorsLength));
    const preset = $derived(INTENSITY_PRESETS[intensity3d]);
    const bgColor = $derived(getColor(colors, faceData.colorIndex));
    const sizeValue = $derived(typeof size === 'number' ? `${size}px` : size);

    // Calculate 3D transform
    const transform = $derived.by(() => {
        if (intensity3d === 'none') {
            return undefined;
        }
        const rotateX = isHovered && interactive ? 0 : faceData.rotation.x * preset.rotateRange;
        const rotateY = isHovered && interactive ? 0 : faceData.rotation.y * preset.rotateRange;
        return `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${preset.translateZ}px)`;
    });

    // Container style
    const containerStyle = $derived.by(() => {
        let style = `width: ${sizeValue}; height: ${sizeValue}; background-color: ${bgColor};`;
        if (intensity3d !== 'none') {
            style += ` perspective: ${preset.perspective}; transform-style: preserve-3d;`;
        }
        return style;
    });

    // Face container style
    const faceStyle = $derived.by(() => {
        let style =
            'position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2;';
        if (transform) {
            style += ` transform: ${transform};`;
        }
        if (intensity3d !== 'none') {
            style += ' transform-style: preserve-3d;';
        }
        if (interactive) {
            style += ' transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);';
        }
        return style;
    });

    function handleMouseEnter() {
        if (interactive) {
            isHovered = true;
        }
    }

    function handleMouseLeave() {
        if (interactive) {
            isHovered = false;
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class={cn(
        "facehash relative flex items-center justify-center overflow-hidden",
        className,
    )}
    style="{containerStyle} container-type: size;"
    data-facehash=""
    data-interactive={interactive || undefined}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
>
    <!-- Gradient overlay -->
    {#if variant === "gradient"}
        <div
            data-facehash-gradient=""
            class="absolute inset-0 pointer-events-none z-1"
            style="background: radial-gradient(ellipse 100% 100% at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 60%);"
        ></div>
    {/if}

    <!-- Face container with 3D transform -->
    <div data-facehash-face="" style={faceStyle}>
        <!-- Face SVG (Eyes) -->
        {#if faceData.faceType === "round"}
            <RoundFace
                class="w-[60%] h-auto max-w-[90%] max-h-[40%]"
                {enableBlink}
                blinkTimings={faceData.blinkTimings}
            />
        {:else if faceData.faceType === "cross"}
            <CrossFace
                class="w-[60%] h-auto max-w-[90%] max-h-[40%]"
                {enableBlink}
                blinkTimings={faceData.blinkTimings}
            />
        {:else if faceData.faceType === "line"}
            <LineFace
                class="w-[60%] h-auto max-w-[90%] max-h-[40%]"
                {enableBlink}
                blinkTimings={faceData.blinkTimings}
            />
        {:else}
            <CurvedFace
                class="w-[60%] h-auto max-w-[90%] max-h-[40%]"
                {enableBlink}
                blinkTimings={faceData.blinkTimings}
            />
        {/if}

        <!-- Initial letter (mouth) -->
        {#if showInitial}
            <span data-facehash-initial="" style="margin-top: 8%; font-size: 26cqw; line-height: 1;">
                {faceData.initial}
            </span>
        {/if}
    </div>
</div>

<style>
    @keyframes -global-facehash-blink {
        0%,
        92%,
        100% {
            transform: scaleY(1);
        }
        96% {
            transform: scaleY(0.05);
        }
    }
</style>
