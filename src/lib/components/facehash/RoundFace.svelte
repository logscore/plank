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

    const rightBlinkStyle = $derived(
        enableBlink && blinkTimings?.right
            ? `animation: facehash-blink ${blinkTimings.right.duration}s ease-in-out ${blinkTimings.right.delay}s infinite; transform-origin: center center;`
            : ''
    );

    const leftBlinkStyle = $derived(
        enableBlink && blinkTimings?.left
            ? `animation: facehash-blink ${blinkTimings.left.duration}s ease-in-out ${blinkTimings.left.delay}s infinite; transform-origin: center center;`
            : ''
    );
</script>

<svg aria-hidden="true" class={className} fill="none" viewBox="0 0 63 15" xmlns="http://www.w3.org/2000/svg">
    <!-- Right eye -->
    <g style={rightBlinkStyle}>
        <circle cx="55.2" cy="7.2" fill="currentColor" r="7.2" />
    </g>
    <!-- Left eye -->
    <g style={leftBlinkStyle}>
        <circle cx="7.2" cy="7.2" fill="currentColor" r="7.2" />
    </g>
</svg>
