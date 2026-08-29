import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () =>
	new Response("ok\n", {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
