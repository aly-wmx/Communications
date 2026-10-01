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

Records are saved in the browser's local storage on the computer being used —
there is no server or login. That means:

- Data stays on that one browser profile. Use **Import / export → Download
  backup** regularly, and to move the log to another machine.
- Clearing browser data deletes the records.

If several people need to share one live log, the storage layer
(`src/lib/store.ts`) is the single place to swap in a hosted database.

## Running it

Requires Node.js 20+.

```bash
npm install
npm run dev       # local development server
npm test          # unit tests
npm run build     # production build into dist/
```

`dist/` is a static site (relative paths), so it can be hosted on any static
host — GitHub Pages, Netlify, Vercel, or an internal web server.

## Project layout

```
src/
  App.tsx                 views, navigation, import/export
  components/             Dashboard, CommList, Calendar, CommForm, Badges
  lib/types.ts            record shape, channels, statuses, priorities
  lib/records.ts          create/update, filters, sorting, stats, CSV, backup parsing
  lib/store.ts            localStorage persistence hook
  lib/sample.ts           sample data for a first look
```

To change the list of channels or statuses, edit `src/lib/types.ts`.
