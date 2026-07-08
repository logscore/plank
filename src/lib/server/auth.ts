import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { and, eq, gt } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { db } from "./db/index";
import { schema } from "./db/schema";

export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: "sqlite",
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
			organization: schema.organization,
			member: schema.member,
			invitation: schema.invitation,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // 1 day
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const existingUsers = db.select({ id: schema.user.id }).from(schema.user).limit(1).all();
					if (existingUsers.length === 0) {
						return { data: user };
					}

					const invitation = db
						.select({ id: schema.invitation.id })
						.from(schema.invitation)
						.where(
							and(
								eq(schema.invitation.email, user.email),
								eq(schema.invitation.status, "pending"),
								gt(schema.invitation.expiresAt, new Date())
							)
						)
						.limit(1)
						.get();

					if (!invitation) {
						throw new APIError("FORBIDDEN", { message: "Signup requires a pending invitation" });
					}

					return {
						data: user,
					};
				},
			},
		},
	},
	plugins: [
		organization({
			allowUserToCreateOrganization: async (user) => {
				const existingOrg = db.select({ id: schema.organization.id }).from(schema.organization).limit(1).get();
				if (!existingOrg) {
					return true;
				}

				const ownerMembership = db
					.select({ id: schema.member.id })
					.from(schema.member)
					.where(and(eq(schema.member.userId, user.id), eq(schema.member.role, "owner")))
					.limit(1)
					.get();

				return Boolean(ownerMembership);
			},
		}),
	],
	telemetry: {
		enabled: false,
	},
});
