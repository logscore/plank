/// <reference types="@sveltejs/kit" />

declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				email: string;
				name: string | null;
				role: string;
			} | null;
			session: {
				id: string;
				userId: string;
				expiresAt: Date;
				activeOrganizationId?: string | null;
			} | null;
		}
	}
}

export {};
