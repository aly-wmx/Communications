# Communications Dashboard

A web app for the communications coordinator to log, schedule and track every
communication that goes out — emails, newsletters, press releases, social posts,
website updates, memos, SMS, events and print.

## What it does

- **Dashboard** — headline numbers (sent this month, due in the next 7 days,
  awaiting approval, overdue, total), what's coming up, the approval pipeline,
  volume by channel, sent per month, and recently sent items. Click any tile or
  bar to jump to the matching records.
- **Communications log** — searchable, sortable table with filters for status,
  channel, owner, date range and overdue items. One-click "Mark sent", and CSV
  export of whatever is currently filtered.
- **Calendar** — month view of planned, sent and overdue items. Click an empty
  part of a day to log a communication on that date.
- **Record form** — title, channel, status (Draft → In review → Approved →
  Scheduled → Sent, or Cancelled), priority, audience, owner, requester,
  scheduled and sent dates, reach, link, tags, key message and notes. Changes to
  status, dates, owner, channel and priority are kept in a per-record history.
- **Import / export** — JSON backup and restore (merge or replace), and a full
  CSV export for spreadsheets.

## Where the data lives

Everything is stored in the **WMX Client Communications** Supabase project and
updates live for everyone who has it open.

- **Sign-in:** email link, no passwords. Only people listed under
  Settings → Team (by email) can see or change anything; this is enforced in the
  database with row-level security, not just in the app.
- **GoHighLevel:** `POST /api/ghl/webhook?secret=…` (see below) adds incoming
  texts and calls to the queue, and marks them responded when the team replies
  through GHL.

### Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Where it's used | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | `https://eloznbkkmkdfgjajambo.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | Supabase → Project Settings → API Keys → publishable key |
| `SUPABASE_URL` | webhook | same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook only | Supabase → Project Settings → API Keys → secret key. Never prefix with `VITE_`. |
| `GHL_WEBHOOK_SECRET` | webhook only | a long random string; also goes in the GHL webhook URL |

### GoHighLevel setup

In GHL: **Automation → Workflows → Create workflow**.

1. Trigger **Customer Replied** (inbound texts, emails, chats) and/or **Call Status** (calls, missed calls).
2. Action **Webhook**, URL `https://<your-app>/api/ghl/webhook?secret=<GHL_WEBHOOK_SECRET>`.
3. Optional **Custom Data** on the action:
   - `event`: `inbound` (default), `outbound`, `call`, `missed_call` or `voicemail`
   - `message`: the message text, if GHL's default field is empty for that trigger

A separate workflow that fires when your team sends a message, with `event = outbound`,
marks that client's waiting contacts as responded.

Open `https://<your-app>/api/ghl/webhook?secret=…` in a browser to check the URL:
it shows `{"ok":true}` when the secret is right.

## Running it

Requires Node.js 20+. Copy `.env.example` to `.env.local` and fill in the browser values.

```bash
npm install
npm run dev       # local development server (the /api webhook runs on Vercel)
npm test          # unit tests
npm run build     # production build into dist/
```

Deployed on Vercel: the Vite site plus the `api/` serverless function.

## Project layout

```
api/ghl/webhook.ts        GoHighLevel → queue (Vercel function)
src/
  App.tsx                 sections and navigation
  components/AuthGate.tsx email sign-in and team-list check
  components/tracker/     client queue, clients, escalation, settings
  components/announcements/ outgoing announcements
  lib/tracker/            SLA engine, queue logic, database row mapping
  lib/sync.ts             live two-way sync of a table with Supabase
  lib/ghl.ts              GHL payload parsing
```

To change the channels or statuses, edit `src/lib/tracker/types.ts` and the
matching `check` constraints in the database.
