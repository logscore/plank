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

<svg aria-hidden="true" class={className} fill="none" viewBox="0 0 63 9" xmlns="http://www.w3.org/2000/svg">
    <!-- Left eye -->
    <g style={leftBlinkStyle}>
        <path
            d="M0 5.1c0-.1 0-.2 0-.3.1-.5.3-1 .7-1.3.1 0 .1-.1.2-.1C2.4 2.2 6 0 10.5 0S18.6 2.2 20.2 3.3c.1 0 .1.1.1.1.4.3.7.9.7 1.3v.3c0 1 0 1.4 0 1.7-.2 1.3-1.2 1.9-2.5 1.6-.2 0-.7-.3-1.8-.8C15 6.7 12.8 6 10.5 6s-4.5.7-6.3 1.5c-1 .5-1.5.7-1.8.8-1.3.3-2.3-.3-2.5-1.6v-1.7z"
            fill="currentColor"
        />
    </g>
    <!-- Right eye -->
    <g style={rightBlinkStyle}>
        <path
            d="M42 5.1c0-.1 0-.2 0-.3.1-.5.3-1 .7-1.3.1 0 .1-.1.2-.1C44.4 2.2 48 0 52.5 0S60.6 2.2 62.2 3.3c.1 0 .1.1.1.1.4.3.7.9.7 1.3v.3c0 1 0 1.4 0 1.7-.2 1.3-1.2 1.9-2.5 1.6-.2 0-.7-.3-1.8-.8C57 6.7 54.8 6 52.5 6s-4.5.7-6.3 1.5c-1 .5-1.5.7-1.8.8-1.3.3-2.3-.3-2.5-1.6v-1.7z"
            fill="currentColor"
        />
    </g>
</svg>
