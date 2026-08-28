import { describe, expect, it } from "vitest";
import { GET } from "../routes/health/+server";

describe("health endpoint", () => {
	it("responds without authentication or dependencies", async () => {
		const response = await GET({} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		await expect(response.text()).resolves.toBe("ok\n");
	});
});
