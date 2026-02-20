import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db/index';
import { schema } from './db/schema';

export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(db, {
		provider: 'sqlite',
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
	user: {
		additionalFields: {
			role: {
				type: 'string',
				defaultValue: 'user',
				input: false,
			},
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // 1 day
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					// First user to register becomes admin
					const existingUsers = db.select({ id: schema.user.id }).from(schema.user).limit(1).all();
					return {
						data: {
							...user,
							role: existingUsers.length === 0 ? 'admin' : 'user',
						},
					};
				},
			},
		},
	},
	plugins: [
		organization({
			allowUserToCreateOrganization: async (user) => {
				// Only the global admin can create profiles (organizations)
				const dbUser = db
					.select({ role: schema.user.role })
					.from(schema.user)
					.where(eq(schema.user.id, user.id))
					.get();
				return dbUser?.role === 'admin';
			},
		}),
	],
	telemetry: {
		enabled: false,
	},
});
