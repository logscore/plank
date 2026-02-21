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

<svg aria-hidden="true" class={className} fill="none" viewBox="0 0 82 8" xmlns="http://www.w3.org/2000/svg">
    <!-- Left eye (2 segments) -->
    <g style={leftBlinkStyle}>
        <rect fill="currentColor" height="6.9" rx="3.5" width="6.9" x="0.07" y="0.16" />
        <rect fill="currentColor" height="6.9" rx="3.5" width="20.7" x="7.9" y="0.16" />
    </g>
    <!-- Right eye (2 segments) -->
    <g style={rightBlinkStyle}>
        <rect fill="currentColor" height="6.9" rx="3.5" width="6.9" x="74.7" y="0.16" />
        <rect fill="currentColor" height="6.9" rx="3.5" width="20.7" x="53.1" y="0.16" />
    </g>
</svg>
