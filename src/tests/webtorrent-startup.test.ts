import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("installed WebTorrent compatibility", () => {
	it("parses a magnet and finds its torrent without crashing Node", () => {
		const script = `
            import assert from "node:assert/strict";
            import { once } from "node:events";
            import WebTorrent from "webtorrent";
            const hash = "0123456789abcdef0123456789abcdef01234567";
            const magnet = "magnet:?xt=urn:btih:" + hash;
            const client = new WebTorrent({ dht: false, tracker: false, lsd: false, utp: false, natUpnp: false, natPmp: false });
            try {
                const torrent = client.add(magnet);
                await once(torrent, "infoHash");
                assert.equal(torrent.infoHash, hash);
                assert.equal(await client.get(magnet), torrent);
            } finally {
                await new Promise((resolve, reject) => client.destroy(error => error ? reject(error) : resolve()));
            }
        `;
		expect(() =>
			execFileSync(process.execPath, ["--input-type=module", "-e", script], {
				stdio: "pipe",
				timeout: 10_000,
			})
		).not.toThrow();
	});
});
