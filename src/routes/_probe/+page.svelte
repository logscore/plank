<script lang="ts">
    import { Collapsible } from "bits-ui";
    import IndexerManager from "$lib/components/IndexerManager.svelte";
    import OnboardingIndexer from "$lib/components/onboarding/OnboardingIndexer.svelte";

    let report = $state("pending");
    let settingsOpen = $state(false);

    if (typeof window !== "undefined") {
        const realFetch = window.fetch.bind(window);
        window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            let url: string;
            if (typeof input === "string") {
                url = input;
            } else if (input instanceof URL) {
                url = input.href;
            } else {
                url = input.url;
            }
            const reply = (body: unknown) => Response.json(body);
            if (url.includes("/api/prowlarr/test")) {
                return reply({ success: true });
            }
            if (url.includes("/api/prowlarr/indexer/schema")) {
                return reply(
                    Array.from({ length: 25 }, (_, i) => ({ name: `Schema ${i}`, protocol: "torrent", fields: [] }))
                );
            }
            if (url.includes("/api/prowlarr/indexer")) {
                return reply(
                    Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Indexer ${i}`, protocol: "torrent" }))
                );
            }
            if (url.includes("/api/prowlarr/status")) {
                return reply({ configured: true, needsSetup: false });
            }
            return realFetch(input as RequestInfo, init);
        }) as typeof window.fetch;
    }

    function press(el: Element | null) {
        if (!el) {
            return;
        }
        const opts = { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: "mouse" } as const;
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new PointerEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
    }

    function describe(label: string, el: HTMLElement | null): string {
        if (!el) {
            return `${label}=MISSING`;
        }
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return `${label} rect=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)} vis=${st.visibility} opacity=${st.opacity} z=${st.zIndex} parent=${el.parentElement?.getAttribute("data-bits-floating-content-wrapper") !== null ? "floating-wrapper" : el.parentElement?.tagName}`;
    }

    $effect(() => {
        const lines: string[] = [];
        setTimeout(() => {
            // 1. onboarding dropdown inside the real onboarding card
            press(document.querySelector("#onboard [data-dropdown-menu-trigger]"));
            setTimeout(() => {
                const menu = document.querySelector("[data-dropdown-menu-content]") as HTMLElement | null;
                lines.push(describe("onboard_menu", menu));
                lines.push(`onboard_items=${menu?.querySelectorAll("[data-dropdown-menu-item]").length ?? 0}`);
                lines.push(`portal_parent=${menu?.closest("body > *")?.tagName ?? "none"}`);
                press(menu ? document.body : null); // close
                // 2. settings nesting: outer collapsible -> IndexerManager -> inner collapsible -> select
                settingsOpen = true;
                setTimeout(() => {
                    const inner = document.querySelector("#settings [data-collapsible-trigger]") as HTMLElement | null;
                    lines.push(`inner_collapsible=${Boolean(inner)}`);
                    press(inner);
                    setTimeout(() => {
                        const trigger = document.querySelector("#settings [data-select-trigger]") as HTMLElement | null;
                        lines.push(`select_trigger=${Boolean(trigger)}`);
                        press(trigger);
                        setTimeout(() => {
                            const content = document.querySelector("[data-select-content]") as HTMLElement | null;
                            lines.push(describe("select_content", content));
                            lines.push(`select_items=${content?.querySelectorAll("[data-select-item]").length ?? 0}`);
                            report = lines.join("\n");
                        }, 700);
                    }, 700);
                }, 900);
            }, 800);
        }, 2500);
    });
</script>

<div id="onboard" class="flex min-h-[40vh] items-center justify-center px-4 py-10">
    <div class="w-full max-w-md rounded-3xl border border-white/10 bg-card/60 p-8 shadow-2xl backdrop-blur-xl">
        <OnboardingIndexer prowlarrUrl="http://localhost:9696" prowlarrApiKey="test" />
    </div>
</div>

<div id="settings" style="padding:40px">
    <Collapsible.Root bind:open={settingsOpen} class="rounded-2xl border border-white/10">
        <Collapsible.Trigger class="w-full p-4 text-left">Prowlarr</Collapsible.Trigger>
        <Collapsible.Content>
            <div class="p-4">
                <IndexerManager />
            </div>
        </Collapsible.Content>
    </Collapsible.Root>
</div>

<pre id="probe-report">{report}</pre>
