<script lang="ts">
    interface Props {
        size?: number;
        class?: string;
        color?: string;
        strokeWidth?: number;
    }

    let {
        size = 12,
        class: className = '',
        color = 'currentColor',
        strokeWidth = 2,
    }: Props = $props();
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
>
    <path d="m17 2-5 5-5-5" />
    <rect width="20" height="15" x="2" y="7" rx="2" />
</svg>
