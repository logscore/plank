<script lang="ts">
    let {
        class: className = '',
        enableBlink = false,
        blinkTimings,
    }: {
        class?: string;
        enableBlink?: boolean;
        blinkTimings?: {
            left: { delay: number; duration: number };
            right: { delay: number; duration: number };
        };
    } = $props();

    const leftBlinkStyle = $derived(
        enableBlink && blinkTimings?.left
            ? `animation: facehash-blink ${blinkTimings.left.duration}s ease-in-out ${blinkTimings.left.delay}s infinite; transform-origin: center center;`
            : ''
    );

    const rightBlinkStyle = $derived(
        enableBlink && blinkTimings?.right
            ? `animation: facehash-blink ${blinkTimings.right.duration}s ease-in-out ${blinkTimings.right.delay}s infinite; transform-origin: center center;`
            : ''
    );
</script>

<svg aria-hidden="true" class={className} fill="none" viewBox="0 0 71 23" xmlns="http://www.w3.org/2000/svg">
    <!-- Left eye -->
    <g style={leftBlinkStyle}>
        <rect fill="currentColor" height="23" rx="3.5" width="7" x="8" y="0" />
        <rect fill="currentColor" height="7" rx="3.5" width="23" x="0" y="8" />
    </g>
    <!-- Right eye -->
    <g style={rightBlinkStyle}>
        <rect fill="currentColor" height="23" rx="3.5" width="7" x="55.2" y="0" />
        <rect fill="currentColor" height="7" rx="3.5" width="23" x="47.3" y="8" />
    </g>
</svg>
