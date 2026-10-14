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
| 2. Daily work | Inbox (replaces Client Queue and Clients), Call Log, Team Chat, Archived | Done |
| 3. Escalation & GHL | Escalations, Slack + email alerts, Settings, GHL sync per business | Done |
| 3b. Board | Tickets beside client items (To do / In progress / Waiting / Done), "assigned to you", due and overdue reminders | Done |
| 4. Outgoing & reporting | Reports and CSV export done; Announcements and templates not started | In progress |

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
| `GHL_LOCATION_ID`, `GHL_API_KEY` | The original GoHighLevel sub-account (Watermark) and its Private Integration token. |
| `GHL_API_KEY_<location id>` | The token for any other business's sub-account, e.g. `GHL_API_KEY_ve9EPM428h8vShlRW1KT`. |

### Supabase Auth

1. **Authentication → URL Configuration:** Site URL = the Vercel address; add
   `https://<vercel-address>/**` and `http://localhost:3000/**` to Redirect URLs.
2. **Authentication → Sign In / Providers → Google:** enable, and paste the
   Client ID and Client Secret from a Google Cloud OAuth client (type "Web
   application") whose authorised redirect URI is
   `https://eloznbkkmkdfgjajambo.supabase.co/auth/v1/callback`.

### GoHighLevel

Each business has its own GoHighLevel sub-account. The first business uses
`GHL_LOCATION_ID` + `GHL_API_KEY`. To connect another:

1. In that sub-account, create a Private Integration token (conversations,
   messages and contacts scopes).
2. In Vercel, add it as `GHL_API_KEY_<location id>` and redeploy.
3. On **Businesses**, enter the location ID for that business. The once-a-minute
   sync then picks up its messages and copies its history, and replies go out
   through that sub-account.

Optional webhook for faster pickup: Workflow → **Webhook** action →
`https://<vercel-address>/api/ghl/webhook?secret=<GHL_WEBHOOK_SECRET>`.
Optional Custom Data: `event` = `inbound` (default), `call`, `missed_call` or
`voicemail`; `message` = the text. The business is the one connected to the
sub-account that sent it (`&business=<id>` is the fallback).

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
