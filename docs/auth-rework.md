# Better Auth-First Auth Rework

## Working assumptions
- Better Auth organization plugin is source of truth for profile membership, invitations, active profile, and profile-scoped authorization.
- Keep Better Auth's default org role vocabulary everywhere: `member | admin | owner`.
- Stick to Better Auth's default org ACL unless product requires an override:
  - `owner`: full org control, including delete and ownership changes
  - `admin`: manage org settings, members, and invitations
  - `member`: read-only
- Do not keep a global user role or owner flag. Platform authorization comes from Better Auth org ownership plus one bootstrap rule for the first organization.
- Do not add the Better Auth admin plugin in first pass. Per-profile auth belongs in the organization plugin, and first-org bootstrap stays a small app rule.
- `locals` should stay thin session plumbing from Better Auth, not a second auth source of truth.
- Client mutation flows need handleable errors, not redirects.

## Goals
- First signup stays open.
- Every signup after first user is invite-only.
- Profile, member, and invitation flows use Better Auth APIs directly.
- Role names become `member | admin | owner` across UI, DB, and auth config.
- Organization creation is owner-only after bootstrap: if no org exists, first authenticated user may create it; otherwise only existing org owners may create orgs.
- Remaining custom API routes use Better Auth permission checks instead of manual role or membership queries.

## Plan

### 1. Make `src/lib/server/auth.ts` the single auth rule file
- Keep `emailAndPassword.enabled = true`.
- Keep invite-only signup logic in `databaseHooks.user.create.before`, because Better Auth does not have a built-in "first signup open, later closed" switch:
  - first user allowed
  - later signups require a matching pending, unexpired Better Auth invitation for the same email
  - reject invalid signup with `APIError` so Better Auth returns a normal auth error
- Configure the organization plugin as the profile auth system:
  - `allowUserToCreateOrganization`: return `true` when either no organization exists yet, or the current user is already an `owner` member in at least one organization
  - `requireEmailVerificationOnInvitation`: decide in this pass; recommended if invite links or invitation IDs are exposed outside email
  - `organizationHooks`: only for business rules Better Auth does not already cover

### 2. Use Better Auth org APIs for profile, member, and invitation workflows
- Keep or move UI mutations to Better Auth client and server APIs:
  - `organization.create`
  - `organization.setActive`
  - `organization.getFullOrganization`
  - `organization.update`
  - `organization.delete`
  - `organization.inviteMember`
  - `organization.listMembers`
  - `organization.listInvitations`
  - `organization.updateMemberRole`
  - `organization.removeMember`
  - `organization.acceptInvitation`
  - `organization.cancelInvitation`
- Delete custom profile CRUD logic in `src/routes/api/profiles/[id]/+server.ts`. Rename and delete should go through `organization.update` and `organization.delete`.
- Update `src/routes/(app)/account/+page.server.ts` to prefer `auth.api.getFullOrganization()` plus Better Auth member and invitation helpers over direct org and member reads.
- Keep `src/routes/accept-invitation/[id]/+page.server.ts` on `auth.api.acceptInvitation()`.

### 3. Use Better Auth permissions for app-specific routes that remain
- For routes that cannot disappear because they do app work, check org authorization with Better Auth instead of raw `schema.member` queries.
- Prefer `auth.api.hasPermission()` with an explicit `organizationId` and `organization.update` permission, or `auth.api.getActiveMemberRole()`, over manual `member.role === "admin"` checks.
- Example routes:
  - `src/routes/api/upload/logo/+server.ts`
  - `src/routes/api/settings/update/+server.ts`
  - `src/routes/api/settings/test-connection/+server.ts`
  - `src/routes/api/prowlarr/indexer/+server.ts`
- If a route updates organization metadata after app-specific work, do the final org write through `auth.api.updateOrganization()`.

### 4. Keep session plumbing thin
- In `src/hooks.server.ts`, populate `locals` from `auth.api.getSession()` and stop re-querying or carrying a separate app role.
- Keep active-profile selection based on Better Auth session state plus `auth.api.listOrganizations()` and `auth.api.setActiveOrganization()`.
- Page loads can still redirect in `hooks.server.ts` and `+page.server.ts`.
- Mutation APIs should never redirect for auth failures.

### 5. Align schema and types to Better Auth
- Regenerate Better Auth's Drizzle schema and merge required diffs into `src/lib/server/db/schema.ts`.
- Remove the app-level `user.role` field from Better Auth config and from the DB schema if we want the cleanup to be complete.
- Update `src/app.d.ts` and auth-related types to derive from Better Auth where practical, such as `InferOrganizationRolesFromOption<...>`, instead of hand-written duplicate unions.
- Keep `authClient` and server auth config on the same role map if we add custom access control later.

### 6. Keep Better Auth defaults unless product needs an override
- Default Better Auth org ACL already gives:
  - `owner`: full org control
  - `admin`: manage members, invitations, and org updates
  - `member`: no management permissions
- Important default: org `admin` cannot delete the organization. Only org `owner` can.
- If product truly needs "admin can delete profile too", that becomes an explicit custom access-control task, not first-pass cleanup.

### 7. Error model for frontend mutations
- Prefer direct Better Auth client calls for auth and profile mutations, because they already return `{ data, error }` instead of crashing navigation.
- For remaining custom `+server.ts` mutation routes, convert auth failures to `json({ error }, { status: 401 | 403 })`.
- Result:
  - UI shows toast
  - page stays put
  - no error-page navigation for expected auth failures

## Known app-specific exceptions
- Better Auth `listOrganizations` is membership-scoped, not platform-wide. If we keep an all-profiles directory, access should be based on app policy like "user owns at least one org", not a global role.
- Keep that exception small: use app queries only to list profiles, then use Better Auth for actual authorization and mutations.

## Follow-up
- If we enable invite email delivery, wire `sendInvitationEmail` in the organization plugin instead of treating invitations as a DB-only concept.
- If we want stricter invite security, enable `requireEmailVerificationOnInvitation: true` and add regular email verification flow.
- Important behavior: with no global owner flag, any user promoted to `owner` in any organization will also gain permission to create new organizations if we use org ownership as the create gate.
- Do not add a new `api-guard.ts`; Better Auth calls should be the guard layer unless repeated app-specific permission checks truly need one tiny helper.
