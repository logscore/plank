# Migration to Better Auth Organization Plugin: Implementation Document

## Executive Summary

This document outlines the migration strategy for implementing Better Auth's organization plugin in the Plank project, enabling multi-user organization management with role-based access control and invitation systems. The migration will transform the current single-user media library system into a collaborative platform where organizations can own and share media content.

## Current State Analysis

### Existing Architecture
- **Auth System**: Better Auth v1.4.17 with email/password authentication
- **Database**: SQLite with Drizzle ORM
- **Media Ownership**: User-scoped via `userId` foreign key
- **Access Control**: Individual user access only
- **Key Tables**: `user`, `media`, `seasons`, `episodes`, `downloads`

### Migration Requirements
1. Enable organization-based media ownership
2. Implement user invitation system
3. Add role-based permissions (owner, admin, member)
4. Maintain backward compatibility with existing user data
5. Update API endpoints to support organization context

## Migration Strategy

### Phase 1: Database Schema Updates

#### 1.1 Add Organization Tables

**New Tables to Add:**

```sql
-- Organizations table
CREATE TABLE organization (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo TEXT,
    metadata TEXT, -- JSON
    created_at INTEGER NOT NULL, -- timestamp_ms
    updated_at INTEGER NOT NULL -- timestamp_ms
);

-- Members table
CREATE TABLE member (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at INTEGER NOT NULL, -- timestamp_ms
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
    UNIQUE(user_id, organization_id)
);

-- Invitations table
CREATE TABLE invitation (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL, -- timestamp_ms
    created_at INTEGER NOT NULL, -- timestamp_ms
    updated_at INTEGER NOT NULL, -- timestamp_ms
    FOREIGN KEY (inviter_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
);
```

#### 1.2 Update Existing Tables

**Modify Session Table:**
```sql
ALTER TABLE session ADD COLUMN active_organization_id TEXT;
ALTER TABLE session ADD COLUMN active_team_id TEXT;
```

**Modify Media Table:**
```sql
ALTER TABLE media ADD COLUMN organization_id TEXT;
ALTER TABLE media ADD CONSTRAINT fk_media_organization 
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;
```

#### 1.3 Migration Script

Create migration to handle existing user data:

```typescript
// Migration: 0004_organization_migration.ts
export async function migrate004(db: DrizzleDB) {
    // 1. Create new tables
    await db.schema.createTable(organization).execute();
    await db.schema.createTable(member).execute();
    await db.schema.createTable(invitation).execute();
    
    // 2. Add new columns to existing tables
    await db.schema.alterTable(session).addColumn(
        'activeOrganizationId',
        text('active_organization_id')
    ).execute();
    
    await db.schema.alterTable(media).addColumn(
        'organizationId',
        text('organization_id')
    ).execute();
    
    // 3. Create default organization for each existing user
    const users = await db.select().from(user);
    for (const existingUser of users) {
        const orgId = generateId();
        const memberId = generateId();
        
        // Create organization
        await db.insert(organization).values({
            id: orgId,
            name: `${existingUser.name}'s Organization`,
            slug: `${existingUser.name.toLowerCase().replace(/\s+/g, '-')}-${orgId.slice(-6)}`,
            createdAt: new Date(),
            updatedAt: new Date()
        }).execute();
        
        // Create owner membership
        await db.insert(member).values({
            id: memberId,
            userId: existingUser.id,
            organizationId: orgId,
            role: 'owner',
            createdAt: new Date()
        }).execute();
        
        // Update existing media to belong to user's organization
        await db.update(media)
            .set({ organizationId: orgId })
            .where(eq(media.userId, existingUser.id))
            .execute();
    }
}
```

### Phase 2: Authentication Configuration

#### 2.1 Update Auth Configuration

```typescript
// src/lib/server/auth.ts
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

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
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
    },
    plugins: [
        organization({
            // Enable invitation system
            sendInvitationEmail: async (data) => {
                const inviteLink = `${env.BETTER_AUTH_URL}/accept-invitation/${data.id}`;
                // TODO: Implement email service
                console.log('Invitation email:', {
                    to: data.email,
                    from: data.inviter.user.email,
                    organization: data.organization.name,
                    link: inviteLink
                });
            },
            // Optional: Restrict organization creation
            allowUserToCreateOrganization: async (user) => {
                // Allow all users for now, can be restricted later
                return true;
            },
        }),
    ],
    telemetry: {
        enabled: false,
    },
});
```

#### 2.2 Update Client Configuration

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/client';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
    baseURL: env.PUBLIC_BETTER_AUTH_URL,
    plugins: [
        organizationClient(),
    ],
});
```

### Phase 3: API Updates

#### 3.1 Media API Organization Context

Update media endpoints to support organization-based access:

```typescript
// src/routes/api/media/+server.ts
import { auth } from '$lib/server/auth';
import { db, schema } from '$lib/server/db';

export async function GET({ url, locals }) {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });
    
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    const activeOrganizationId = session.activeOrganizationId;
    const urlParam = url.searchParams.get('organization');
    const organizationId = urlParam || activeOrganizationId;
    
    if (!organizationId) {
        return new Response('No organization context', { status: 400 });
    }
    
    // Verify user is member of organization
    const membership = await db.query.member.findFirst({
        where: and(
            eq(member.userId, session.user.id),
            eq(member.organizationId, organizationId)
        )
    });
    
    if (!membership) {
        return new Response('Access denied', { status: 403 });
    }
    
    // Fetch media for organization
    const mediaList = await db.query.media.findMany({
        where: eq(media.organizationId, organizationId),
        with: {
            seasons: {
                with: {
                    episodes: true
                }
            },
            downloads: true
        }
    });
    
    return json(mediaList);
}

export async function POST({ request, locals }) {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });
    
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    const body = await request.json();
    const organizationId = session.activeOrganizationId || body.organizationId;
    
    if (!organizationId) {
        return new Response('Organization required', { status: 400 });
    }
    
    // Verify permissions (admin or owner)
    const membership = await db.query.member.findFirst({
        where: and(
            eq(member.userId, session.user.id),
            eq(member.organizationId, organizationId)
        )
    });
    
    if (!membership || (membership.role !== 'admin' && membership.role !== 'owner')) {
        return new Response('Insufficient permissions', { status: 403 });
    }
    
    // Create media with organization context
    const newMedia = {
        id: generateId(),
        organizationId,
        ...body,
        addedAt: new Date()
    };
    
    await db.insert(schema.media).values(newMedia).execute();
    return json(newMedia, { status: 201 });
}
```

#### 3.2 Organization Management Endpoints

Create new API routes for organization management:

```typescript
// src/routes/api/organizations/+server.ts
import { auth } from '$lib/server/auth';

export async function GET({ locals }) {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });
    
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    // Get user's organizations
    const organizations = await db.query.member.findMany({
        where: eq(member.userId, session.user.id),
        with: {
            organization: true
        }
    });
    
    return json(organizations.map(org => org.organization));
}

export async function POST({ request, locals }) {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });
    
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    const body = await request.json();
    
    // Create organization using Better Auth
    const organization = await auth.api.createOrganization({
        body: {
            name: body.name,
            slug: body.slug,
            logo: body.logo,
            metadata: body.metadata
        },
        headers: locals.request.headers
    });
    
    return json(organization);
}
```

#### 3.3 Invitation Management

```typescript
// src/routes/api/invitations/+server.ts
export async function POST({ request, locals }) {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });
    
    if (!session?.user) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    const body = await request.json();
    
    // Create invitation
    const invitation = await auth.api.createInvitation({
        body: {
            email: body.email,
            role: body.role || 'member',
            organizationId: body.organizationId
        },
        headers: locals.request.headers
    });
    
    return json(invitation);
}

// src/routes/accept-invitation/[invitationId]/+server.ts
export async function POST({ params, locals }) {
    const session = await auth.api.getSession({
        headers: locals.request.headers
    });
    
    if (!session?.user) {
        return new Response('Must be logged in to accept invitation', { status: 401 });
    }
    
    // Accept invitation
    const result = await auth.api.acceptInvitation({
        body: {
            invitationId: params.invitationId
        },
        headers: locals.request.headers
    });
    
    return json(result);
}
```

### Phase 4: Frontend Updates

#### 4.1 Organization Selector Component

```svelte
<!-- src/components/OrganizationSelector.svelte -->
<script lang="ts">
    import { authClient } from '$lib/auth-client';
    import { onMount } from 'svelte';

    let organizations = $state([]);
    let activeOrganization = $state(null);
    let showCreateModal = $state(false);

    onMount(async () => {
        const { data } = await authClient.organization.list();
        organizations = data || [];
        
        const { data: active } = await authClient.organization.getActiveMember();
        activeOrganization = active?.organization;
    });

    async function setActiveOrganization(org) {
        await authClient.organization.setActive({
            organizationId: org.id
        });
        activeOrganization = org;
    }

    async function createOrganization(name, slug) {
        const { data } = await authClient.organization.create({
            name,
            slug
        });
        
        if (data) {
            organizations.push(data);
            await setActiveOrganization(data);
            showCreateModal = false;
        }
    }

    async function inviteMember(email, role) {
        if (!activeOrganization) return;
        
        await authClient.organization.inviteMember({
            email,
            role,
            organizationId: activeOrganization.id
        });
    }
</script>

<div class="organization-selector">
    <select 
        value={activeOrganization?.id} 
        onchange={(e) => setActiveOrganization(organizations.find(org => org.id === e.target.value))}
    >
        {#each organizations as org}
            <option value={org.id}>{org.name}</option>
        {/each}
    </select>
    
    <button onclick={() => showCreateModal = true}>Create Organization</button>
    
    {#if activeOrganization}
        <button onclick={() => inviteMember(prompt('Email to invite:'), 'member')}>
            Invite Member
        </button>
    {/if}
</div>

<!-- Modal for creating organization -->
{#if showCreateModal}
    <div class="modal">
        <h3>Create Organization</h3>
        <form on:submit|preventDefault={(e) => {
            const formData = new FormData(e.target);
            createOrganization(formData.get('name'), formData.get('slug'));
        }}>
            <input name="name" placeholder="Organization Name" required />
            <input name="slug" placeholder="slug" required />
            <button type="submit">Create</button>
            <button type="button" onclick={() => showCreateModal = false}>Cancel</button>
        </form>
    </div>
{/if}
```

#### 4.2 Update Media Components

Update media browsing to show organization context:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
    import OrganizationSelector from '$components/OrganizationSelector.svelte';
    import MediaGrid from '$components/MediaGrid.svelte';
    import { authClient } from '$lib/auth-client';
    import { onMount } from 'svelte';

    let activeOrganization = $state(null);
    let media = $state([]);

    onMount(async () => {
        const { data } = await authClient.organization.getActiveOrganization();
        activeOrganization = data;
        
        if (activeOrganization) {
            loadMedia();
        }
    });

    async function loadMedia() {
        const response = await fetch(`/api/media?organization=${activeOrganization.id}`);
        media = await response.json();
    }
</script>

<div class="page">
    <OrganizationSelector />
    
    {#if activeOrganization}
        <h2>{activeOrganization.name} Media Library</h2>
        <MediaGrid {media} />
    {:else}
        <p>Select an organization to view media</p>
    {/if}
</div>
```

### Phase 5: Email Configuration

#### 5.1 Email Service Setup

```typescript
// src/lib/server/email.ts
interface InvitationData {
    email: string;
    invitedByUsername: string;
    invitedByEmail: string;
    organizationName: string;
    inviteLink: string;
}

export async function sendOrganizationInvitation(data: InvitationData) {
    // Option 1: Use Resend (recommended)
    if (env.RESEND_API_KEY) {
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({
            from: env.FROM_EMAIL,
            to: [data.email],
            subject: `Invitation to join ${data.organizationName}`,
            html: `
                <h2>You're invited!</h2>
                <p>${data.invitedByUsername} has invited you to join ${data.organizationName} on Plank.</p>
                <p>Click <a href="${data.inviteLink}">here</a> to accept the invitation.</p>
                <p>This invitation expires in 7 days.</p>
            `
        });
    }
    
    // Option 2: Use nodemailer
    // Implementation with SMTP service
}
```

#### 5.2 Update Auth Configuration

```typescript
// src/lib/server/auth.ts (updated)
import { sendOrganizationInvitation } from './email';

export const auth = betterAuth({
    plugins: [
        organization({
            sendInvitationEmail: async (data) => {
                const inviteLink = `${env.PUBLIC_SITE_URL}/accept-invitation/${data.id}`;
                
                await sendOrganizationInvitation({
                    email: data.email,
                    invitedByUsername: data.inviter.user.name,
                    invitedByEmail: data.inviter.user.email,
                    organizationName: data.organization.name,
                    inviteLink
                });
            },
        }),
    ],
});
```

### Phase 6: Database Relations Update

#### 6.1 Update Schema Relations

```typescript
// src/lib/server/db/schema.ts (updated)
export const organization = sqliteTable('organization', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'), // JSON
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .$onUpdate(() => new Date())
        .notNull(),
});

export const member = sqliteTable('member', {
    id: text('id').primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
        .notNull()
        .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
}, (table) => [
    uniqueIndex('member_user_organization_unique').on(table.userId, table.organizationId)
]);

export const invitation = sqliteTable('invitation', {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    inviterId: text('inviter_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
        .notNull()
        .references(() => organization.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('pending'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .$onUpdate(() => new Date())
        .notNull(),
});

// Update existing tables
export const session = sqliteTable(
    'session',
    {
        // ... existing fields
        activeOrganizationId: text('active_organization_id')
            .references(() => organization.id, { onDelete: 'set null' }),
    },
    (table) => [
        // ... existing indexes
        index('session_active_organization_idx').on(table.activeOrganizationId)
    ]
);

export const media = sqliteTable(
    'media',
    {
        // ... existing fields
        organizationId: text('organization_id')
            .references(() => organization.id, { onDelete: 'set null' }),
    },
    (table) => [
        // ... existing indexes
        index('idx_media_organization').on(table.organizationId)
    ]
);
```

#### 6.2 Update Relations

```typescript
export const organizationRelations = relations(organization, ({ one, many }) => ({
    members: many(member),
    invitations: many(invitation),
    media: many(media),
}));

export const memberRelations = relations(member, ({ one }) => ({
    user: one(user, {
        fields: [member.userId],
        references: [user.id],
    }),
    organization: one(organization, {
        fields: [member.organizationId],
        references: [organization.id],
    }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
    inviter: one(user, {
        fields: [invitation.inviterId],
        references: [user.id],
    }),
    organization: one(organization, {
        fields: [invitation.organizationId],
        references: [organization.id],
    }),
}));

// Update media relations
export const mediaRelations = relations(media, ({ one, many }) => ({
    user: one(user, {
        fields: [media.userId],
        references: [user.id],
    }),
    organization: one(organization, {
        fields: [media.organizationId],
        references: [organization.id],
    }),
    seasons: many(seasons),
    downloads: many(downloads),
}));
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Update Better Auth configuration
- [ ] Create database migration
- [ ] Update schema files
- [ ] Test basic organization creation

### Week 2: API Development
- [ ] Implement organization management endpoints
- [ ] Update media API for organization context
- [ ] Add invitation endpoints
- [ ] Test API endpoints

### Week 3: Frontend Integration
- [ ] Create organization selector component
- [ ] Update media browsing components
- [ ] Add invitation management UI
- [ ] Test user workflows

### Week 4: Polish & Testing
- [ ] Email integration setup
- [ ] Role-based access control testing
- [ ] Performance optimization
- [ ] Documentation updates

## Security Considerations

1. **Access Control**: Verify organization membership for all media operations
2. **Permission Checks**: Implement role-based permissions (owner/admin/member)
3. **Data Isolation**: Ensure users can only access their organization's data
4. **Invitation Security**: Use signed invitation links with expiration
5. **Email Verification**: Require verified emails for invitation acceptance

## Testing Strategy

### Unit Tests
```typescript
// tests/auth/organization.test.ts
describe('Organization Management', () => {
    test('should create organization for user', async () => {
        // Test organization creation
    });
    
    test('should invite member to organization', async () => {
        // Test invitation flow
    });
    
    test('should enforce role permissions', async () => {
        // Test access control
    });
});
```

### Integration Tests
- End-to-end organization creation workflow
- Media sharing within organizations
- Invitation acceptance flow
- Permission boundary testing

## Rollback Plan

If issues arise during migration:

1. **Database Backup**: Create full backup before migration
2. **Feature Flags**: Add environment variable to disable organization features
3. **Gradual Rollout**: Enable organization features per-user initially
4. **Revert Script**: Migration to revert to user-scoped media ownership

## Conclusion

This migration transforms Plank from a single-user application into a multi-tenant platform while preserving all existing functionality. The organization plugin provides a robust foundation for collaborative media management with proper access controls and invitation systems.

Key benefits:
- **Collaborative Media Libraries**: Teams can share movies and shows
- **Role-Based Access**: Proper permissions for different user levels
- **Scalable Architecture**: Easy to add more organization features
- **Backward Compatibility**: Existing user data is preserved
- **Security**: Proper access controls and verification

The phased approach minimizes risk while delivering value incrementally to users.