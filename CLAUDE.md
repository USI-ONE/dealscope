# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Next.js dev server with Turbopack
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit (no emitted files)
pnpm format       # Prettier over all ts/tsx/md/json

pnpm db:generate  # Generate Drizzle migration SQL from schema changes
pnpm db:apply     # Run pending migrations against Neon (tsx src/db/migrate.ts)
pnpm db:push      # Push schema directly without migration file (dev only)
pnpm db:studio    # Open Drizzle Studio
```

No test suite exists. There is no `test` script.

## Architecture

### Routing

All authenticated routes live under `src/app/(app)/`. The layout at `src/app/(app)/layout.tsx` calls `getActiveContext()` and redirects unauthenticated users to `/sign-in`. External diligence guests (`external_diligence` role) are hard-gated to `/diligence/**` only — the middleware sets `x-pathname` and the layout reads it.

Public routes: `/sign-in`, `/forgot-password`, `/reset-password/[token]`, `/invite/[token]`, `/deal-room/[token]`, `/api/auth/**`.

Every `(app)` page exports `export const dynamic = "force-dynamic"` — nothing is statically rendered.

### Data Layer

**Database client** (`src/db/index.ts`): Drizzle ORM over Neon's HTTP driver (`@neondatabase/serverless`). The `db` export uses a Proxy for lazy initialization so the module can be imported at build time without `DATABASE_URL` being present.

**Migrations**: Schema lives in `src/db/schema/*.ts`. `drizzle-kit generate` produces SQL in `drizzle/`. `db:apply` runs them via `src/db/migrate.ts`. Use `DATABASE_URL_UNPOOLED` for migrations; `DATABASE_URL` (pooled) for runtime. The Neon project is named `techos` and is shared with the TechOS production app — never drop or destructively alter tables that aren't prefixed `ma_` or `diligence`.

**Schema organization** (`src/db/schema/index.ts`): All schema files re-exported. Key files: `auth.ts` (users, sessions), `organizations.ts` (orgs, memberships), `diligence.ts` (core engagement tables), `diligence-deal-room.ts` (vault, data requests, workstreams, parties, dialogue), `clients.ts`, `integrations.ts`.

### Server Actions

All mutations go through `src/server/actions/` using `next-safe-action`. Every action calls `requireContext()` or `requireRole()` at the top, then validates input with Zod. The pattern:

```ts
export const myAction = authActionClient.schema(z.object({...})).action(async ({ parsedInput, ctx }) => { ... })
```

`authActionClient` injects `ctx.session` and `ctx.organization`. Separate action files for `diligence.ts` (CRUD), `diligence-ai.ts` (Anthropic calls), `diligence-vault.ts`, `diligence-deal-room.ts`, `diligence-requests.ts`, `diligence-workstreams.ts`.

### Auth

NextAuth v5 (`src/auth.ts`) with JWT strategy, credentials-only (email + bcrypt). No OAuth/OIDC. `getActiveContext()` in `src/lib/auth-helpers.ts` is the single point of truth — it's React-cached per request and returns `{ user, organization, membership }`. Use `requireContext()` for pages/actions that need auth, `requirePermission(action, resource)` for fine-grained checks.

### RBAC

Defined in `src/lib/rbac.ts`. Five roles (rank order): `owner` > `executive` > `manager` > `member` > `external_diligence`. Finance resources (`bill`, `billable`, `finance`, `report`) require `financeAccess: true` on the membership row in addition to role. `external_diligence` can only read diligence — use `requireRole("member")` to block this role from anything else.

### Diligence Engagement Structure

Core entity is `diligenceEngagements`. One engagement has:
- **5 track tabs**: IT, Legal, Finance, Facilities, HR (rendered by `TrackTabs`)
- **3 ops tabs**: Vault (files), Requests (data requests), Workstreams (tasks + milestones)
- **2 collab tabs**: Deal Room (external parties + dialogue), Log (audit trail)
- **1 summary tab**: Track health, findings, cost lines, briefing draft

Tab state lives in the `?tab=` query param. The engagement detail page (`src/app/(app)/diligence/[id]/page.tsx`) fetches data lazily per active tab.

**IT tab** uses `diligenceEngagementResponses` (keyed by `question_key`) and `diligenceSessions`/`diligenceArtifacts`/`diligenceFindings`.

**MA tabs** (Legal/Finance/Facilities/HR) use `ma_*` tables and the question library in `src/lib/diligence/ma-question-library.ts`.

### AI / Briefing

`ANTHROPIC_API_KEY` gates all AI features. Briefing generation lives in `diligence-ai.ts` and stores the result as JSONB in `diligenceBriefings.contentJson`. The JSON shape has `topRisks[]` (each: `title`, `severity`, `narrative`), `sections[]`, `topOpportunities[]`, `hundredDayPlan[]`.

**Critical**: KPI pills and aggregate counts on `/diligence/[id]/briefing` must read from `briefingDraft.topRisks`, not from `diligenceFindings`. These are two separate stores — `diligenceFindings` is manually entered; `diligenceBriefings` is AI-generated.

### File Handling

Vault files stored in Vercel Blob (`BLOB_READ_WRITE_TOKEN`). Text extraction at `src/lib/diligence/file-extract.ts` handles DOCX (Mammoth), XLSX (ExcelJS), PDF, and plain text. Session recordings follow a `transcriptStatus` state machine (pending → transcribing → done).

### UI Conventions

- Components use shadcn/ui (Radix + Tailwind). Add new shadcn components via `pnpm dlx shadcn@latest add <component>`.
- Toast notifications via `sonner` (`toast.success`, `toast.error`).
- Dark mode uses Tailwind's `class` strategy with CSS variable HSL colors (`bg-background`, `text-foreground`, etc.).
- Tab navigation uses query params, not URL segments, for all sub-navigation within an engagement.

### Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Neon connection (runtime) |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection (migrations) |
| `AUTH_SECRET` | NextAuth JWT signing key |
| `AUTH_URL` | Required in production |
| `ANTHROPIC_API_KEY` | Unlocks AI features (optional) |
| `DEALSCOPE_OWNER_EMAILS` | Comma-separated bootstrap owner emails |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob for vault file storage |

### PowerShell Gotcha

When using PowerShell to read or edit files whose paths contain `[id]` brackets (e.g., `src/app/(app)/diligence/[id]/page.tsx`), always use `-LiteralPath` instead of `-Path` to prevent bracket expansion.
