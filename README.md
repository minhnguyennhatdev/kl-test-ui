# Service Scheduler — UI

A small Next.js front end for the [Unified Service Scheduler](https://github.com/minhnguyennhatdev/kl-test) API:
find a slot, book it, watch it fail honestly, cancel it.

It is deliberately thin. The interesting behaviour lives in the API, and this
exists to make that behaviour visible — advisory availability, a booking that can
still refuse, 409s that carry alternatives, and a cancellation that frees the
slot straight away.

## Running it

Node 24 is required (`.nvmrc`, and `engines` in `package.json`). Tailwind's
PostCSS plugin pulls in an ESM-only dependency that older Node cannot `require`,
and Turbopack resolves its own Node from `PATH` — so `nvm use` before `npm run
dev`, not just a shell that happens to have 24 somewhere.

The API must be up first, on port 3000:

```bash
cd ../keyloop && docker compose up --build -d
```

Then:

```bash
nvm use
npm install
npm run dev
```

The UI runs on <http://localhost:3001> — the API already owns 3000. Point it
somewhere else with `SCHEDULER_API`.

## How it talks to the API

Requests go through a Next.js rewrite (`/api/v1/*` → the scheduler) rather than
straight from the browser. The scheduler sends no CORS headers, by design — its
own harness is served same-origin — so proxying is what keeps the browser
same-origin here too.

Every request carries `x-dealership-id`; every booking carries a fresh
`idempotency-key`. The correlation id from each response is shown under the
result, so a line in the UI can be traced to a line in the API's logs.

## What it shows

- **Availability is advisory.** Capacity is how many of a slot could be booked at
  once. It was true a moment ago, and the page says so.
- **Booking is the authority.** It can refuse a slot availability just offered.
- **A refusal is useful.** 409 carries the nearest bookable starts as buttons.
  409 means "not then"; 422 means "not ever" — the page distinguishes them.
- **Cancelling frees the slot immediately**, and capacity goes back up.
- **Times are the dealership's clock**, not the browser's.
