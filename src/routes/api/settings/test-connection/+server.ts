import { json } from "@sveltejs/kit";
import { auth } from "$lib/server/auth";
import { testProwlarrConnection } from "$lib/server/prowlarr";
import { getSettings } from "$lib/server/settings";
import type { RequestHandler } from "./$types";

type ConnectionTarget = "tmdb" | "opensubtitles" | "prowlarr";

interface TestConnectionRequest {
	opensubtitlesApiKey?: string;
	opensubtitlesPassword?: string;
	opensubtitlesUsername?: string;
	prowlarrApiKey?: string;
	prowlarrUrl?: string;
	target: ConnectionTarget;
	tmdbApiKey?: string;
}

const OPEN_SUBTITLES_BASE_URL = "https://api.opensubtitles.com/api/v1";
const OPEN_SUBTITLES_USER_AGENT = "plank-media v0.1.0";

async function testTmdbConnection(apiKey: string | undefined): Promise<{ success: boolean; message: string }> {
	if (!apiKey?.trim()) {
		return { message: "API key is required", success: false };
	}

	try {
		const settings = await getSettings();
		const response = await fetch(
			`${settings.tmdb.baseUrl}/configuration?api_key=${encodeURIComponent(apiKey.trim())}`
		);
		if (response.ok) {
			return { message: "Connection successful", success: true };
		}
		return { message: `Request failed with status ${response.status}`, success: false };
	} catch (err) {
		return { message: err instanceof Error ? err.message : "Connection failed", success: false };
	}
}

async function testOpenSubtitlesConnection(
	apiKey: string | undefined,
	username: string | undefined,
	password: string | undefined
): Promise<{ success: boolean; message: string }> {
	if (!apiKey?.trim()) {
		return { message: "API key is required", success: false };
	}

	const headers = {
		"Api-Key": apiKey.trim(),
		"Content-Type": "application/json",
		"User-Agent": OPEN_SUBTITLES_USER_AGENT,
	};

	try {
		if (username?.trim() && password?.trim()) {
			const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/login`, {
				body: JSON.stringify({ password: password.trim(), username: username.trim() }),
				headers,
				method: "POST",
			});
			if (response.ok) {
				return { message: "Connection successful", success: true };
			}
			return { message: `Login failed with status ${response.status}`, success: false };
		}

		const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/subtitles?query=test&languages=en`, {
			headers,
		});
		if (response.ok) {
			return { message: "Connection successful", success: true };
		}
		return { message: `Request failed with status ${response.status}`, success: false };
	} catch (err) {
		return { message: err instanceof Error ? err.message : "Connection failed", success: false };
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const organizationId = locals.session?.activeOrganizationId;
	if (!organizationId) {
		return json({ message: "Active profile required", success: false }, { status: 403 });
	}

	const permission = await auth.api.getActiveMemberRole({
		headers: request.headers,
		query: { organizationId },
	});
	if (permission?.role !== "owner") {
		return json({ message: "Only owners can test settings", success: false }, { status: 403 });
	}

	const body = (await request.json()) as TestConnectionRequest;

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
			message: result.success ? "Connection successful" : (result.message ?? "Connection failed"),
			success: result.success,
		});
	}

	return json({ message: "Invalid target", success: false }, { status: 400 });
};
