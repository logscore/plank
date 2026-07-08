import { json, type RequestEvent } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { testProwlarrConnection } from "$lib/server/prowlarr";
import { getSettings } from "$lib/server/settings";

type ConnectionTarget = "tmdb" | "opensubtitles" | "prowlarr";

interface TestConnectionRequest {
	target: ConnectionTarget;
	tmdbApiKey?: string;
	prowlarrUrl?: string;
	prowlarrApiKey?: string;
	opensubtitlesApiKey?: string;
	opensubtitlesUsername?: string;
	opensubtitlesPassword?: string;
}

const OPEN_SUBTITLES_BASE_URL = "https://api.opensubtitles.com/api/v1";
const OPEN_SUBTITLES_USER_AGENT = "plank-media v0.1.0";

async function testTmdbConnection(apiKey: string | undefined): Promise<{ success: boolean; message: string }> {
	if (!apiKey?.trim()) {
		return { success: false, message: "API key is required" };
	}

	try {
		const settings = await getSettings();
		const response = await fetch(
			`${settings.tmdb.baseUrl}/configuration?api_key=${encodeURIComponent(apiKey.trim())}`
		);
		if (response.ok) {
			return { success: true, message: "Connection successful" };
		}
		return { success: false, message: `Request failed with status ${response.status}` };
	} catch (err) {
		return { success: false, message: err instanceof Error ? err.message : "Connection failed" };
	}
}

async function testOpenSubtitlesConnection(
	apiKey: string | undefined,
	username: string | undefined,
	password: string | undefined
): Promise<{ success: boolean; message: string }> {
	if (!apiKey?.trim()) {
		return { success: false, message: "API key is required" };
	}

	const headers = {
		"Api-Key": apiKey.trim(),
		"Content-Type": "application/json",
		"User-Agent": OPEN_SUBTITLES_USER_AGENT,
	};

	try {
		if (username?.trim() && password?.trim()) {
			const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/login`, {
				method: "POST",
				headers,
				body: JSON.stringify({ username: username.trim(), password: password.trim() }),
			});
			if (response.ok) {
				return { success: true, message: "Connection successful" };
			}
			return { success: false, message: `Login failed with status ${response.status}` };
		}

		const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/subtitles?query=test&languages=en`, {
			headers,
		});
		if (response.ok) {
			return { success: true, message: "Connection successful" };
		}
		return { success: false, message: `Request failed with status ${response.status}` };
	} catch (err) {
		return { success: false, message: err instanceof Error ? err.message : "Connection failed" };
	}
}

export const POST = async (event: RequestEvent) => {
	if (!event.locals.user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}
	if (!event.locals.session?.activeOrganizationId) {
		return json({ success: false, message: "Active profile required" }, { status: 403 });
	}

	const permission = await auth.api.getActiveMemberRole({
		headers: event.request.headers,
		query: { organizationId: event.locals.session.activeOrganizationId },
	});
	if (!permission || permission.role !== "owner") {
		return json({ success: false, message: "Only owners can test settings" }, { status: 403 });
	}

	const body = (await event.request.json()) as TestConnectionRequest;

	if (body.target === "tmdb") {
		return json(await testTmdbConnection(body.tmdbApiKey));
	}

	if (body.target === "opensubtitles") {
		return json(
			await testOpenSubtitlesConnection(
				body.opensubtitlesApiKey,
				body.opensubtitlesUsername,
				body.opensubtitlesPassword
			)
		);
	}

	if (body.target === "prowlarr") {
		const result = await testProwlarrConnection(body.prowlarrUrl, body.prowlarrApiKey);
		return json({
			success: result.success,
			message: result.success ? "Connection successful" : (result.message ?? "Connection failed"),
		});
	}

	return json({ success: false, message: "Invalid target" }, { status: 400 });
};
