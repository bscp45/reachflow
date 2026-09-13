# Architecture notes

ReachFlow is an AI voice outreach platform. Clients upload leads, an AI calls
them in English, Hindi or Telugu, and the dashboard tracks what happened.

This document covers the decisions behind the structure, the traps already hit
in this codebase, and where things currently stand. It is aimed at anyone
picking the project up — including future me.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15.5.18, TypeScript, App Router |
| Backend | FastAPI, SQLAlchemy, Alembic, Python 3.11 |
| Database | Neon Postgres, ap-southeast-1 |
| Auth | JWT with TOTP two-factor, bcrypt directly |

Styling is inline rather than Tailwind. That was a deliberate trade: theming is
driven by a single `dark` boolean from context, and inline objects made the
dark/light switch simpler to reason about than maintaining two class sets. It
costs verbosity in the components.

`passlib` was removed in favour of calling `bcrypt` directly. Passlib 1.7.4
reads `bcrypt.__about__` to detect the version, and that module no longer
exists in bcrypt 5.x, so password hashing failed outright. Downgrading bcrypt
would have worked but pinned an unmaintained library into the dependency tree.

### Running locally

Frontend: `npm run dev` on port 3000.
Backend: from `backend/`, with the venv active,
`uvicorn app.main:app --reload --port 8000`.

Use `http://localhost:3000`. CORS allows localhost only, so reaching the dev
server on the machine's LAN IP fails at the preflight request.

---

## Access model

Five roles, split across two organisations — the platform operator and the
client companies using it.

| Role | Scope |
|---|---|
| `super_admin` | Everything, every client |
| `reachflow_manager` | Only clients assigned in `manager_client_assignments` |
| `client_owner` | Their own client; grants permissions to their own staff |
| `client_manager` | Their own client, within granted permissions |
| `client_analyst` | Their own client, read-only by default |

Manager-to-client assignment is many-to-many on purpose: one manager can hold
several clients, and a single client can be covered by several managers.

The division of control: the platform decides which clients exist and who
manages them. Inside a client, the Owner decides who does what. That keeps
the operator out of their customers' internal org structure.

**The invariant that matters:** no client-side user ever sees another client's
data. This is enforced in the database query, not in the UI, so changing the
frontend cannot break it.

---

## Two columns that look similar and are not

`leads.status` and `leads.pipeline_stage` both describe where a lead is, and
conflating them would be easy.

`status` is machine-owned. The system sets it when a call finishes — agreed,
declined, no answer.

`pipeline_stage` is human-owned. Sales staff set it as they work the lead —
responded, advisor assigned, documents sent, invested.

An early version derived the stage from the lead's AI confidence score. That
looked identical on screen but meant the "mark as converted" action had
nowhere to write, and score is a prediction rather than a record of what a
person actually did.

Ten stages exist. Six are active pipeline and appear as board columns. Four
are terminal — retrying, unreachable, declined, do-not-call — and show as
counts beneath the board, because a lead there is not moving forward and does
not need a column.

Guards on the stage endpoint prevent states that cannot be true:

- `not_contacted` cannot be set by hand; it means "never called"
- Stages past `contacted` require `attempts > 0`
- A lead flagged on the do-not-call register cannot re-enter the pipeline

Backwards moves are allowed. Real sales work is not linear and deals stall.

---

## Traps in this codebase

**Alembic does not detect enum value changes.** Autogenerate compares tables,
columns, indexes and constraints — not enum members. Adding a value to a
Python enum produces a migration that silently omits it, and inserts then fail
at runtime with `invalid input value for enum`. Those migrations are written by
hand; `b7c4e2f19a03_sync_postgres_enums.py` is the reference.

**The same enum is defined twice.** `models.py` defines it for SQLAlchemy,
`schemas.py` for Pydantic. Identical members, different Python classes, so
`models.PipelineStage.invested in <tuple of schemas members>` is always false
and any guard built that way does nothing. Comparison constants are built from
the models enum for this reason. This caused a real bug where a lead with zero
call attempts was moved to "invested".

**Route declaration order matters.** `/pipeline/board` and `/stats/campaign`
must come before `/{lead_id}`, or FastAPI matches the literal path segment as
an id and returns a 422.

**All lead queries go through `scoped_lead_query`.** A bare `db.query(Lead)`
in an endpoint bypasses the client boundary. Centralising it means the rule
cannot be enforced in one place and forgotten in another.

**Transcript access returns 404, not 403, when denied.** A 403 confirms the
lead exists, which leaks information across the client boundary on its own.

---

## Data access at scale

The leads table is designed for tens of thousands of rows per client, so
search, sorting and pagination all run in Postgres rather than the browser.
Pulling 50,000 rows down to filter them client-side does not work.

Search is debounced at 350ms so typing a name fires one request rather than
one per keystroke.

Sorting applies a secondary sort on `id`. Without it, two leads with equal
scores can swap positions between pages and a row is either seen twice or
missed entirely.

`nullslast` keeps never-called leads at the bottom when sorting by
`last_called`, rather than surfacing them above leads with real history.

The pipeline board is one request returning all six columns plus terminal
counts. Fetching per column would be ten requests for a single screen. Each
column caps at 50 leads and shows its true count in the header.

---

## Compliance

Built for the Indian market, so the following are architectural constraints
rather than features:

- TRAI restricts outbound commercial calls to 9am–9pm IST
- Numbers must be checked against the NDNC register before dialling
- Phone numbers are personal data under PDPB and stay in-region
- Retry policy: 2 hours on no answer, 30 days after a decline

The `do_not_call` pipeline stage exists so the compliance layer and the sales
pipeline cannot contradict each other.

Audit logging records every state change — who moved which lead, from which
stage to which, with an optional note and the originating IP.

---

## Current state

Working against the live API: two-factor login, Dashboard, Call Data with
server-side search and pagination and real call transcripts, and the Progress
board with stage moves.

Still on mock data: the Settings tab.

Not yet built: the Vapi voice integration, OpenAI call summarisation, the TRAI
compliance layer, and the Celery retry scheduler.

### Endpoints that do not exist yet

Worth stating explicitly, since parts of the Settings UI imply otherwise:

- Listing users within a client
- Updating `client_permissions`
- Persisting compliance settings — the call-window and retry controls are
  currently editable but save nowhere
- Inviting a user
- Integration health checks — the Integrations tab shows Vapi, OpenAI and S3
  as connected; none are

---

## Conventions

Branches: `feat/*` → `dev` → `staging` → `main`, each via pull request.
Direct pushes to `staging` and `main` are blocked by branch ruleset.

Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

Run `npm run build` before pushing frontend changes. The production build type-
checks more strictly than `npm run dev` and has caught several errors that dev
mode allowed through.

`.env` and `backend/seed_credentials.txt` are gitignored and must stay that way.

### Seed data

`backend/seed_data.py` wipes and repopulates the database with 110 leads,
51 users across all five roles, 4 clients with deliberately different
conversion rates, and 55 call logs attached only to leads that were actually
answered.

Two clients are left unassigned to any manager, and one manager is left with
no clients, so the empty states and the assignment flow are both testable.
