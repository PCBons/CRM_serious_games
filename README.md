# Serious Games CRM

A lightweight CRM for registering people and organizations interested in our serious games and moving them through the sales funnel, from first contact to signed deal.

## Features

- **Quick lead registration.** One form creates the organization, the contact person and the deal. Existing organizations and contacts (matched by email) are reused.
- **Pipeline board.** Drag-and-drop kanban across the funnel stages: *New lead → Qualified → Demo / Playtest → Proposal sent → Negotiation → Won / Lost*. Each column shows its total value and win probability.
- **Deal pages.** A clickable stage stepper, *Mark won* and *Mark lost* (with a lost reason), value, product, source, expected close date and owner.
- **Activity timeline.** Log notes, calls, emails and meetings on deals, contacts and organizations. Stage changes are logged automatically.
- **Tasks and follow-ups.** Due dates, assignees, overdue highlighting and a sidebar badge for tasks due today.
- **Dashboard.**
  - Open pipeline and weighted forecast
  - Won revenue, win rate, average deal size and average sales cycle
  - Conversion funnel with the stage-to-stage conversion rate
  - Leads and wins per month
  - Lead source performance and lost reasons
  - Deals that need attention (no update in 14+ days)
- **Contacts and organizations,** with search and full history.
- **Global search** across deals, contacts and organizations.
- **Team accounts** with admin and member roles. Admins add and deactivate users.
- **CSV export** of deals, contacts and organizations. The files open directly in Excel.
- **Light and dark mode** (follows your system setting). Works on mobile.

## Deploy on Railway

1. Push this repository to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** and select this repository.
3. In the same project: **New → Database → Add PostgreSQL**.
4. Open the CRM service → **Variables** → add a reference variable `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
5. Open the service's **Settings → Networking → Generate Domain**.
6. Open the URL. On the first visit you create the admin account. Do this right after deploying.
   - Alternatively, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (and optionally `ADMIN_NAME`) as variables, and the admin is created on start.
7. Add your colleagues under **Settings → Team members**.

The database tables are created automatically on startup.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes (on Railway) | PostgreSQL connection string |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | no | Create the first admin from variables instead of the setup screen |
| `PGSSL` | no | Set to `true` when connecting to Postgres over a public URL that requires SSL |
| `PORT` | no | Set by Railway automatically |

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

Open http://localhost:3000. Without `DATABASE_URL`, the app uses an embedded Postgres (PGlite) stored in `./.data`, so no database setup is needed.

## Customizing

Funnel stages and their win probabilities, lead sources, products and lost reasons are defined in [`config.js`](config.js). Currency and number/date formatting are set at the top of [`public/app.js`](public/app.js) (`LOCALE`, `CURRENCY`).

If you rename a stage `key` after deals exist, update those deals in the database. Changing `label`, `prob` or the lists is always safe.

## Tech

Node.js + Express, PostgreSQL, and a plain HTML/CSS/JS frontend with no build step.
