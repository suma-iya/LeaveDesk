# Employee Leave Tracker (LeaveDesk)

A full-stack web app where **employees** request leave and **HR** approves or rejects it.
HR works from Pending / Approved / All requests tables with bulk decisions and a team calendar; employees see their yearly balance per leave type, request leave on a month picker, and follow each request's status.
Users sign in with email and password, or with **Google**. Every API call is protected by a **JWT**.

- **Backend:** Go (standard-library `net/http`), PostgreSQL
- **Frontend:** LeaveDesk, React 19 + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query + Table
- **Runs with:** `docker compose up` (3 containers: `frontend`, `backend`, `db`)

> **Current status.** The LeaveDesk frontend talks to the backend through one typed interface (`frontend/src/api/contract.ts`) with two implementations: a real `fetch` client and an in-memory mock. **The mock is on by default** (`VITE_USE_MOCK=true`), because the Go API still implements the earlier contract (see [Backend status](#backend-status)). Every screen works end to end on the mock; switching to the real API is one build flag once the endpoints below exist.

> The written explanation of the architecture, code components, API internals and Docker setup is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Features

| Employee | HR |
|---|---|
| **My leave:** available days in total and per type (Annual 16, Casual 3, Sick 3), stacked used/pending bars | **Pending:** all waiting requests with each person's yearly balance; filter by employee, department, type, date range |
| **Request leave:** month picker (Fri + Sat weekends are never counted), live working-day count, balance and overlap checks, optional PDF/image attachment | **Approve / reject** from the table or the review page; reject asks for an optional note; every decision shows a toast with **Undo** for 5 s |
| Edit or cancel a request while it is pending; **Request again** after a rejection | **Bulk** approve / reject selected rows |
| **History** of decided requests with the HR note | **Review page:** employee card, yearly balance and "if approved" preview, teammates away on the same dates, attachment |
| **Request details** with an in-page PDF preview | **Approved** and **All requests** tables, CSV export |
| **Team calendar:** who is away each day | **Team calendar** including each person's remaining days (employees never see other people's balances) |
| **Profile & settings:** photo, details, notification switches, password, light/dark theme | Same profile & settings |

Every list is sortable and paginated, turns into cards below 768px, and works in light and dark themes.

Business rules (enforced by the mock API today, and by the Go API for its endpoints):
- The end date cannot be before the start date, and a request must contain at least one working day.
- A request cannot overlap one of the employee's own pending or approved leaves. The Go API also has a Postgres exclusion constraint, so this holds even for simultaneous requests.
- A request cannot exceed the available balance for its type (allowance − used − pending).
- Only `pending` requests can be decided, edited or cancelled; employees can only see and change their **own** requests.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| API | Go 1.23, `net/http` (Go 1.22+ method routing such as `GET /api/employees/{id}`) | No framework needed. Small, fast, easy to explain |
| DB driver | `pgx/v5` with a connection pool | The standard high-performance Postgres driver for Go |
| Auth | `golang-jwt/jwt/v5` (HS256), `bcrypt`, Google ID token verification | Token-based sessions, safe password storage, Google sign-in |
| Database | PostgreSQL 16 | Relational data with foreign keys, CHECK constraints and date math |
| UI | React 19 + TypeScript (strict) + React Router 7, built by Vite | Typed components and client-side routing |
| Data | TanStack Query (fetching, caching, mutations) + TanStack Table (sorting, selection, pagination) | Server state and tables without hand-written plumbing |
| Components | shadcn/ui (Radix primitives) + Tailwind CSS v4, lucide-react icons, Geist font | Accessible components; all colours are light/dark design tokens |
| Dates & PDF | date-fns, react-pdf | Year-always date formats and Fri/Sat working-day maths; in-page PDF preview |
| Google button | `@react-oauth/google` | Wraps Google Identity Services |
| Serving | nginx | Serves the built React files and reverse-proxies `/api` to Go |
| Containers | Docker multi-stage builds + docker-compose | One command to run everything |

## Run it with Docker

Prerequisites: Docker Desktop (or Docker Engine with the compose plugin).

```bash
git clone <repo-url> employee-leave-tracker
cd employee-leave-tracker
cp .env.example .env
```

Open `.env` and set `JWT_SECRET` to a long random string. You can generate one with `openssl rand -hex 32`. Then run:

```bash
docker compose up --build
```

Open **http://localhost:3000**.

With the default `VITE_USE_MOCK=true`, the UI runs on built-in demo data (it resets when the page reloads). The login page has buttons that fill these in:

| Role | Email | Password |
|---|---|---|
| HR | `farhana.islam@leavedesk.test` | `password123` |
| Employee | `nusrat.jahan@leavedesk.test` | `password123` |

The demo data has about 14 people in 7 departments, a busy week on 4–8 Oct 2026, and a rejected request with a PDF attachment.

The Go backend still starts, creates its tables and seeds its own accounts (`manager@example.com` / `manager123`, …); you can use them against the API directly, for example with curl (see [API reference](#api-reference)). Build the frontend with `VITE_USE_MOCK=false` to point it at `/api` once the LeaveDesk endpoints exist.

Useful commands:

```bash
docker compose logs -f backend
docker compose down
docker compose down -v
```

`logs -f backend` follows the API request log. `down` stops the containers and keeps the data. `down -v` stops them and also deletes the database volume.

### Enabling Google sign-in (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), go to **Create credentials → OAuth client ID → Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:3000`.
3. Put the client ID in `.env` as `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`.
4. Optionally list manager accounts: `MANAGER_EMAILS=you@gmail.com`. Set `GOOGLE_AUTO_SIGNUP=false` if only people a manager has added should be able to sign in.
5. Run `docker compose up -d` again. The **Continue with Google** button appears on the login page.

When `GOOGLE_CLIENT_ID` is empty, the button is hidden and the password login still works. Google sign-in needs the real API, so it only appears in a `VITE_USE_MOCK=false` build.

## Run without Docker (development)

You need Go 1.23+, Node 20+ and a local Postgres. Start the backend:

```bash
cd backend
export DATABASE_URL="postgres://leave:leave_secret@localhost:5432/leave_tracker?sslmode=disable"
export JWT_SECRET="dev-secret-at-least-16-chars"
export SEED_MANAGER_EMAIL=manager@example.com SEED_MANAGER_PASSWORD=manager123 SEED_DEMO_DATA=true
go run ./cmd/api
```

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `localhost:8080`, just as nginx does in Docker. The frontend alone (`npm run dev`) is enough to try every screen on the mock API; run it with `VITE_USE_MOCK=false npm run dev` to call the Go server instead.

Other frontend scripts: `npm run build` (type-check with `tsc -b`, then bundle), `npm run typecheck`, `npm run lint` (oxlint).

## Tests

The service layer has table-driven unit tests. They use in-memory fakes, so no database is needed:

```bash
cd backend && go test ./...
```

If your local Go is older than 1.23, run the tests in Docker instead:

```bash
docker run --rm -v "$PWD/backend":/src -w /src golang:1.23-alpine go test ./...
```

## Project structure

```
.
├── docker-compose.yml          # db + backend + frontend
├── .env.example                # all configuration, documented
├── docs/ARCHITECTURE.md        # written explanation (architecture, internals, Docker)
├── backend/
│   ├── Dockerfile              # multi-stage: golang → alpine
│   ├── cmd/api/main.go         # entry point: config → DB → wiring → HTTP server
│   └── internal/
│       ├── config/             # env vars → Config struct
│       ├── database/           # pgx pool, retry, embedded SQL migrations
│       ├── model/              # domain types (User, Leave, Date) + error kinds
│       ├── repository/         # SQL only (parameterised queries)
│       ├── service/            # business rules + unit tests
│       ├── handler/            # HTTP: decode → service → JSON, routes
│       ├── middleware/         # logging, panic recovery, JWT auth, role check
│       ├── auth/               # bcrypt, JWT issue/parse, Google token verifier
│       ├── respond/            # JSON response helpers
│       └── seed/               # first manager + demo data
└── frontend/
    ├── Dockerfile              # multi-stage: node:20-alpine build → nginx:alpine
    ├── nginx.conf              # static files + /api reverse proxy + SPA fallback
    ├── public/mock/            # sample PDF attachment for the demo data
    └── src/
        ├── api/                # contract.ts (the LeaveApi interface), one fetch client per
        │                       # resource, mock.ts + mockData.ts, queries.ts (query keys + shared hooks)
        ├── components/         # Button system, DataTable, badges, avatar, bars, cards (+ ui/ from shadcn)
        ├── features/
        │   ├── auth/           # AuthProvider (JWT session), route guards, login page
        │   ├── manager/        # HR: Pending, Approved, All requests, request review
        │   ├── employee/       # My leave, History, Request leave, request details, PDF preview
        │   ├── calendar/       # Team calendar (shared)
        │   └── profile/        # Profile & settings
        ├── layouts/            # AppShell: desktop top bar + avatar menu, mobile app bar + tab bar
        ├── lib/                # dates.ts, leave.ts (working days, balances), theme.ts, jwt.ts
        ├── routes.tsx          # route tree with role guards
        └── types.ts            # domain types shared by API and UI
```

## Architecture in brief

```
Browser ──► nginx (frontend container, :3000→80)
              ├── /            → React build (index.html, JS, CSS)
              └── /api/*       → proxy_pass http://backend:8080
                                   │
                         Go API (backend container)
              Logger → Recover → Authenticate(JWT) → RequireRole(MANAGER) → Handler
                                   │
                              Service (rules)
                                   │
                            Repository (SQL)
                                   │
                         PostgreSQL (db container, volume pgdata)
```

- **Typed API seam.** Pages call TanStack Query hooks; the hooks call `api.*`, which is either the `fetch` client or the in-memory mock, chosen once at build time. Nothing else in the UI knows which one is active.
- **One origin.** The browser only talks to nginx, so there is no CORS setup and the API port is never published.
- **Layered backend.** A handler parses HTTP, a service applies rules, a repository runs SQL. Services depend on interfaces, which is how they are unit-tested with fakes.
- **JWT auth.** Login returns a signed JWT holding the user id. On every request the middleware verifies the signature and loads the user, so a deleted account is locked out at once and the role always comes from the database.
- **Google sign-in.** The browser gets an ID token from Google, and the backend verifies it with Google (checking that it was issued for this app's client ID). The backend then finds, links or creates the user and issues **its own** JWT, so both login methods end in the same kind of session.

### Frontend: how the data flows

An HR approval on the Pending page shows how the pieces fit together:

1. `PendingPage` renders a `DataTable` (TanStack Table) from `useRequestRows({ status: 'pending', …filters })`, a TanStack Query hook. Its query key includes the filters, so changing a filter fetches, caches and shows the new rows while keeping the old ones visible.
2. HR clicks the green **Approve** icon button. `useDecide()` runs `api.decideRequest(id, { status: 'approved' })`.
3. `api` is `mockApi` (default) or the fetch client. The fetch client sends `POST /api/requests/LV-2041/decision` with `Authorization: Bearer <jwt>`; the mock checks the same rules in memory.
4. On success a toast says "Approved …" with **Undo** for 5 seconds; Undo calls `api.reopenRequest(id)`.
5. Either way, `invalidateLeaveData()` marks every request list, request detail, balance and calendar query as stale. Every mounted query refetches, so the table, the "Pending" count in the nav and the balances update together.

Routing uses the role in the JWT: `/hr/*` renders only for `hr`, `/me/*` only for `employee` (`features/auth/guards.tsx`). This is navigation only; the API checks the role again on every call.

### Backend: brief explanation of inner workings

An approval in the current Go API shows how the backend pieces fit together:

1. A client sends `PATCH /api/leaves/42/status` with `Authorization: Bearer <jwt>`; in Docker, nginx forwards it to `backend:8080`.
2. `Logger` starts a timer. `Authenticate` verifies the JWT signature and expiry, loads the user (and their current role) and puts them in the request context. `RequireRole(MANAGER)` checks the role.
3. `handler.ReviewLeave` reads `{id}` and decodes the JSON body. It rejects unknown fields and bodies over 1 MB.
4. `LeaveService.Review` validates the status (only `APPROVED` or `REJECTED`) and calls the repository.
5. The repository runs `UPDATE leaves SET status=$1 … WHERE id=$4 AND status='PENDING'`. If 0 rows change, the service works out whether the leave doesn't exist (`404`) or was already reviewed (`409`).
6. The handler writes the updated leave as JSON.

The full walkthrough, including login and Google flows, the schema, the API table, the error mapping and the Docker details, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Backend status

The Go API was built for the first version of the UI. LeaveDesk needs a few things it does not have yet: roles named `hr` / `employee`, request ids like `LV-2041`, working days that skip Fri + Sat, per-type allowances and balances, attachments, profile fields (first/last name, age, job title, years at company, avatar), bulk decisions and a calendar feed. `frontend/src/api/*.ts` already calls these endpoints; implementing them in Go is the next step:

| Method & path | Used by |
|---|---|
| `GET /auth/config`, `POST /auth/login`, `POST /auth/google`, `GET /auth/me` | login, session restore |
| `GET /requests?status=&type=&department=&from=&to=&year=&q=&mine=` | every table |
| `GET /requests/{id}` · `POST /requests` · `PUT /requests/{id}` · `DELETE /requests/{id}` | details, request form, cancel |
| `POST /requests/{id}/decision` · `DELETE /requests/{id}/decision` · `POST /requests/decisions` | approve/reject, Undo, bulk |
| `GET /balances?employeeId=&year=` · `GET /policy` · `GET /departments` | balance cards, filters |
| `GET /calendar?month=yyyy-MM&department=&type=&includePending=` | team calendar |
| `GET /profile` · `PUT /profile` · `POST /profile/avatar` · `POST /attachments` | profile, uploads |

The request/response shapes are the TypeScript types in `frontend/src/types.ts`, and `frontend/src/api/mock.ts` is a working reference for every rule.

## API reference (current Go API)

All routes are under `/api`. Every error response has the shape `{"error": "message"}`.

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health` | public | Liveness check (used by the Docker healthcheck) |
| `GET /auth/config` | public | `{google_client_id, timezone, demo_mode}` for the login page |
| `POST /auth/login` | public | `{email, password}` → `{token, user}` |
| `POST /auth/google` | public | `{credential}` (Google ID token) → `{token, user}` |
| `GET /auth/me` | any user | Current user from the JWT |
| `GET /leaves/mine` | employee | My leave requests |
| `GET /leaves/mine/summary` | employee | My counts + approved days this year |
| `POST /leaves` | employee | Apply: `{leave_type, start_date, end_date, reason}` |
| `DELETE /leaves/{id}` | employee (owner) | Cancel my own **pending** request |
| `GET /dashboard?date=YYYY-MM-DD` | manager | Status counts, requests on date, on leave, employee count |
| `GET /leaves?status=&created_on=&employee_id=` | manager | All requests with filters |
| `PATCH /leaves/{id}/status` | manager | `{status: APPROVED\|REJECTED, comment}` |
| `GET /employees` | manager | Employees with leave counts |
| `POST /employees` | manager | Create: `{name, email, department, password?}` |
| `GET /employees/{id}` | manager | Profile, summary and full leave list |
| `PUT /employees/{id}` | manager | Update |
| `DELETE /employees/{id}` | manager | Delete (their leaves are deleted too) |

Example:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -d '{"email":"manager@example.com","password":"manager123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -s -H "Authorization: Bearer $TOKEN" "localhost:3000/api/dashboard"
```
