# WMX Client Communications

Internal portal for tracking client communications: every call, text and
message waiting on a response, who owns it, how long it has waited, and when it
escalates. Built on the same foundation as the WMX Control Panel (marketing
tracker): same sign-in, sidebar and look, different content.

- **Stack:** Next.js (App Router) on Vercel, Supabase (Postgres + row-level security, Auth).
- **Contributor rules:** [`CLAUDE.md`](CLAUDE.md)

## Status

| Phase | Scope | State |
|---|---|---|
| 1. Foundation | Sign-in (password + Google), roles, sidebar, Team, Businesses, Overview | Done |
| 2. Daily work | Client Queue, Clients, Call Log | Next |
| 3. Escalation & GHL | Escalations page, Slack + email alerts, Settings, GHL connection status | |
| 4. Outgoing & reporting | Announcements, Reports, templates | |

The response-time engine, queue logic and GoHighLevel payload parsing already
exist in `src/lib/comms` with tests; phases 2–4 build screens on top of them.

## Access

- Anyone whose email is on **Team** can sign in, with **Continue with Google** or
  email + password. Everyone else is signed straight back out. The database
  enforces the same rule.
- **Admin:** everything, including Team, Businesses and Settings.
  **Manager:** everything else; receives escalations.
  **Coordinator:** queue, clients, call log, announcements; can escalate.
- The database refuses to remove or demote the last admin.

## Setup

### Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eloznbkkmkdfgjajambo.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API Keys → secret key. Server only; used for invites and the GHL webhook. |
| `GHL_WEBHOOK_SECRET` | A long random string; also goes in the GHL webhook URL. |

### Supabase Auth

1. **Authentication → URL Configuration:** Site URL = the Vercel address; add
   `https://<vercel-address>/**` and `http://localhost:3000/**` to Redirect URLs.
2. **Authentication → Sign In / Providers → Google:** enable, and paste the
   Client ID and Client Secret from a Google Cloud OAuth client (type "Web
   application") whose authorised redirect URI is
   `https://eloznbkkmkdfgjajambo.supabase.co/auth/v1/callback`.

### GoHighLevel

Workflow → **Webhook** action →
`https://<vercel-address>/api/ghl/webhook?secret=<GHL_WEBHOOK_SECRET>`.
Optional Custom Data: `event` = `inbound` (default), `outbound`, `call`,
`missed_call` or `voicemail`; `message` = the text. Add `&business=<id>` to
send a workflow's new clients to a business other than the first one.

## Development

```bash
cp .env.example .env.local   # fill in the two NEXT_PUBLIC_ values
npm install
npm run dev
npm test
npm run build
```

## Layout

```
src/app/login, forgot-password, reset-password   sign-in pages
src/app/auth/callback                            Google sign-in return
src/app/dashboard/                               sidebar layout and sections
src/app/api/ghl/webhook                          GoHighLevel → queue
src/lib/comms/                                   SLA engine, queue logic, GHL parsing (tested)
src/lib/announcements/                           outgoing announcements logic (phase 4)
supabase/migrations/                             schema, applied in order
```
