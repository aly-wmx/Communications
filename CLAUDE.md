# CLAUDE.md — WMX Client Communications

@AGENTS.md

Standing contract for work on this repo. If something below conflicts with a prompt in the moment, **this file wins unless the human explicitly overrides it in that message.**

## What this project is

Internal portal for client communications at WMX businesses (Watermark Design Build first; more added from the Businesses page). Same foundation, sign-in, sidebar and visual language as the WMX Control Panel (`aly-wmx` marketing tracker) — keep them consistent.

- **Frontend/hosting:** Next.js (App Router) on Vercel.
- **Backend:** Supabase project `eloznbkkmkdfgjajambo` — Postgres with Row-Level Security, Auth (password + Google).
- **Sections:** Overview, Client Queue, Escalations, Clients, Call Log, Announcements, Reports; admin-only Team, Businesses, Settings.

## Roles (do not treat as flexible without a human decision)

| Role | Who | Can do |
|---|---|---|
| admin | Aly | Everything, including Team, Businesses, Settings |
| manager | Reid, Chris | Everything except Team, Businesses, Settings; receive escalations |
| coordinator | Van | Queue, clients, call log, announcements; can escalate |

Access is the `team_members` table: a signed-in email gets in only if it is listed there. Enforced by RLS (`is_team_member()`, `current_member_role()`) and re-checked in `src/lib/auth.ts`.

## Architecture patterns to follow

- **Per-business vs. shared-across-businesses is structural, not a convention.** `clients` and `announcements` carry a `business_id`; contacts belong to a business through their client. Team members and settings are shared across businesses.
- **Validate at the boundary, enforce again in the schema.** Every write goes through a shared validation schema (client + server action) *and* a database constraint (`NOT NULL`, foreign key, `CHECK`). Neither layer is optional — the constraint is what protects the data if the validation layer ever has a bug.
- **Server actions, not a hand-rolled API layer.** Reads happen in server components; writes happen in server actions. Do not introduce a separate REST/GraphQL API without a human decision first.
- **RLS is the access control, not the UI.** Never implement a permission check only in a component — it must exist as a Postgres policy. UI-level hiding is a UX nicety on top of an RLS rule, never a substitute for one.
- **Secrets never reach the browser.** The service-role key and webhook secret live only in Vercel's server environment, never behind a `NEXT_PUBLIC_` name.
- **Computed, not typed in.** Wait times, SLA stage and "needs escalation" are derived from timestamps at read time by `src/lib/comms` — never stored.

## No-touch files

Never edit these without the human explicitly asking for that specific file, in that specific message:

- `.env`, `.env.local`, `.env.*` — any environment/secrets file.
- `supabase/migrations/*` — migrations are additive. Never edit one that has been applied; write a new one. Never delete one.
- `package-lock.json` — regenerate via npm, never hand-edit.
- `vercel.json` and any CI config — changes here affect what ships automatically.
- This file (`CLAUDE.md`).
