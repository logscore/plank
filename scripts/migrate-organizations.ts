import { generateId } from 'better-auth';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/server/db/index';
import { schema } from '../src/lib/server/db/schema';

async function migrateOrganizationData() {
	try {
		console.log('Starting organization migration...');

		// 1. Create default organization for each existing user
		const users = await db.select().from(schema.user);
		console.log(`Found ${users.length} users to migrate`);

		for (const user of users) {
			const orgId = generateId();
			const memberId = generateId();

			console.log(`Creating organization for user: ${user.name} (${user.email})`);

			// Create organization
			await db
				.insert(schema.organization)
				.values({
					id: orgId,
					name: `${user.name}'s Organization`,
					slug: `${user.name.toLowerCase().replace(/\s+/g, '-')}-${orgId.slice(-6)}`,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.execute();

			// Create owner membership
			await db
				.insert(schema.member)
				.values({
					id: memberId,
					userId: user.id,
					organizationId: orgId,
					role: 'owner',
					createdAt: new Date(),
				})
				.execute();

			// Update existing media to belong to user's organization
			const result = await db
				.update(schema.media)
				.set({ organizationId: orgId })
				.where(eq(schema.media.userId, user.id))
				.execute();

			console.log(`Created organization and migrated ${result.changes || 0} media items for ${user.name}`);
		}

		console.log('Organization migration completed!');
	} catch (error) {
		console.error('Migration failed:', error);
		process.exit(1);
	}
}

// Run the migration
migrateOrganizationData();
