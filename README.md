# LeaveDesk: Employee Leave Tracker

LeaveDesk is a full-stack web app for requesting and approving leave.

- **Employees** see their yearly balance per leave type. They request leave on a calendar that skips weekends, attach a medical note or plan, and follow each request until HR decides.
- **HR** approves or rejects requests, with Undo. HR also sets each person's department, salary and per-person leave limits, and sees who is away on a team calendar.

Sign-in uses email and password, and optionally Google. The session is a JWT in an httpOnly cookie. Every rule is enforced by the Go API; the UI only mirrors the rules to give instant feedback.

- **Backend:** Go 1.23 (`net/http`), PostgreSQL 16, pgx, golang-migrate
- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query and Table
- **Runs with:** `docker compose up --build`, which starts three containers: `frontend`, `backend` and `db`

The written explanation (architecture, key components, API internals, Docker) is in **[docs/EXPLANATION.md](docs/EXPLANATION.md)**.

---

## 1. What the app does

| Employee | HR |
|---|---|
| **My leave:** available days in total and per type (Annual 16, Casual 3, Sick 3), shown as stacked used/pending bars | **Pending:** every waiting request, with each person's yearly "8/22 used" bar |
| **Request leave:** a month picker where Fri and Sat are never counted, a live working-day count, and the same validation as the server | **Approve / Reject** from the table or the review page. Rejecting asks for an optional note. A toast offers **Undo** for 5 seconds |
| Edit or cancel a request while it is pending. **Request again** after a rejection | **Review page:** employee card, "If approved: N days left", teammates away on the same dates, the attachment |
| **History** of decided requests with HR's note | **Approved** and **All** tables. All has a **Mine** chip so HR can find their own requests |
| **Request details** with an in-page PDF preview | **People:** everyone's leave this year; change a person's department, salary (with history) and leave limits |
| **Team calendar** overlay showing who is away each day | The same calendar, plus CSV **Export** of any table |
| **Profile:** photo, name, date of birth, password, light/dark theme | The same profile page |

The rules the server enforces:

- The first account ever created becomes HR. Everyone who signs up after that is an employee and can use the app straight away, with no approval step.
- A request needs at least one working day. It cannot overlap your own pending or approved leave, and cannot exceed `limit − used − pending` for its type.
- Only pending requests can be edited, cancelled or decided. **Nobody can decide their own request**; HR's own requests go to another HR.
- Salary is visible to HR only. HR cannot change anyone's name, email, date of birth, password, role or joining date. HR cannot change their own salary or limits either.

## 2. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| HTTP | Go 1.23 standard library `net/http` (method + `{id}` patterns from Go 1.22) | Enough for every route, with no framework to learn or explain. This follows the project's backend rule. |
| Database | PostgreSQL 16 + `pgx/v5` (pgxpool), hand-written SQL | Foreign keys, CHECK constraints, date maths and advisory locks for the concurrency rules |
| Migrations | `golang-migrate` with SQL embedded in the binary | Runs on startup, so there are no manual steps |
| Auth | `bcrypt`, `golang-jwt/jwt/v5` (HS256), Google OpenID Connect | Salted password hashes, and a stateless signed session in an httpOnly cookie |
| Logging | `log/slog` (JSON) | One structured line per request |
| UI | React 19 + TypeScript (strict) + React Router 7, built by Vite | Typed components and client-side routing |
| Data | TanStack Query (cache, refetch after changes) and TanStack Table (server-paged tables) | Server state without hand-written loading and caching |
| Components | shadcn/ui (Radix) + Tailwind CSS v4, lucide icons, Geist font | Accessible building blocks. Every colour is a light/dark design token |
| Dates, PDF | date-fns, react-pdf | Year-always date formats and Fri/Sat working-day maths, plus an in-page PDF preview |
| Serving | nginx | Serves the built UI and proxies `/api` to Go on the same origin |

## 3. Setup

Prerequisites: Docker Desktop, or Docker Engine with the compose plugin.

```bash
cp .env.example .env
docker compose up --build
```

Before starting, open `.env` and set `JWT_SECRET` to a long random string; `openssl rand -hex 32` makes one.

Open **http://localhost:3000**. The database starts empty and the migrations run automatically.

**First run: how the first account becomes HR.** While no HR exists, the Register page says so. The first account you create becomes **HR**. Everyone who registers after that is an **employee** and goes straight to My leave. HR can then set their department on the People page.

**Demo data (optional).** To replace everything with a demo company:

```bash
make seed
```

This is the same as `docker compose exec backend /app/leavedesk seed --reset`. Every demo password is `password123`.

| Role | Email | Notes |
|---|---|---|
| HR | `hr@company.test` | Farhana Islam |
| Employee | `nusrat.j@company.test` | 8 days available, a pending request for 04–08 Oct, and a rejected request with a PDF |
| Employee | `rakib.h@company.test` | Joined this week, no leave history yet |

The seed also creates 12 more employees in 7 departments. The week of 04–08 Oct 2026 is busy.

**Promoting someone to HR.** This is not in the UI by design:

```bash
docker compose exec backend /app/leavedesk promote --email someone@company.test
docker compose exec backend /app/leavedesk demote --email someone@company.test
```

`demote` refuses to remove the last HR.

**Google sign-in (optional).** Create an OAuth client of type "Web application" with the redirect URI `http://localhost:3000/api/auth/google/callback`. Put its ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then run `docker compose up -d` again. Google signs people in to existing accounts; new people register first, because Google doesn't provide a date of birth. Email and password work without any Google configuration.

**Other commands**

| Command | What it does |
|---|---|
| `make test` | `go vet` and the Go tests, run in a Go container |
| `cd frontend && npm test` | The TypeScript unit tests (`lib/leave.ts`), using Node's built-in test runner |
| `make logs` | Follows the API's JSON request log |
| `make reset` | `docker compose down -v`, which deletes the database and uploaded files |

**Development without Docker for the UI:** run `cd frontend && npm install`, then `API_PROXY=http://localhost:3000 npm run dev` while the stack runs. Vite proxies `/api` to it, just as nginx does.

## 4. Architecture

```
Browser ──► nginx  (frontend container, published as :3000)
             ├── /         React build: index.html, hashed JS/CSS, SPA fallback
             └── /api/*    proxy_pass http://backend:8080   (same origin, so the cookie just works)
                              │
                        Go API  (backend container, :8080, not published)
             log → recover → session cookie → reload user → role check → handler
                              │
                        service  (account · leave · hr · files)   ← all business rules
                              │
                        store    (pgx, hand-written SQL)
                              │                        ╲
                        PostgreSQL (db, volume pgdata)   files on volume uploads (/data/uploads)
```

**A request's journey**, using HR approving Nusrat's request (id 2041). Request ids appear only in URLs, never on screen:

1. The browser sends `POST /api/requests/2041/decision` with the `ld_session` cookie. JavaScript never sees the token.
2. nginx forwards the request to `backend:8080`.
3. The middleware verifies the JWT, then **reloads the user** from Postgres (a deleted account or a changed role applies at once). It rejects non-HR users with `403 FORBIDDEN`.
4. The handler decodes `{status, note}` and calls `leave.Service.Decide`.
5. The service applies `CanDecide`: HR only, not your own request (`SELF_APPROVAL`), and only while the request is pending.
6. The store runs `UPDATE … WHERE id=$1 AND status='pending'`. If someone else decided first, zero rows change and the result is `409 NOT_PENDING`.
7. The handler returns JSON. The UI refreshes every list, balance and calendar that shows this request.

## 5. Inner workings (summary)

- **Working days:** the dates from start to end that are not Friday or Saturday. The same function exists in Go (`leave.WorkingDays`) and TypeScript (`lib/leave.ts`), with the same test cases on both sides.
- **Balance maths:** `available = limit − used(approved) − pending`. The limit is the policy default from config unless HR set an override for that person and year. A request counts against the year it starts in.
- **Validation order:** type → both dates → start ≤ end → at least one working day → reason length → overlap with your own pending or approved leave → enough balance. The error messages are exact, for example `Not enough Annual leave: 6 days available, 9 requested.`
- **Concurrency:** create and edit run in a transaction holding a per-user advisory lock, so two simultaneous submissions can't both pass the checks. Decisions are atomic on `status='pending'`. The first-HR check runs under its own advisory lock.
- **First account = HR:** registration takes an advisory lock, checks whether any HR exists, and makes the new account HR only if none does. Two people registering at the same moment can't both become HR.
- **Undo:** there is no undo endpoint. The UI holds a decision for 5 seconds before sending it. If the tab closes, it is sent with `fetch keepalive`.

The details are in [docs/EXPLANATION.md](docs/EXPLANATION.md).

## 6. Docker

| Service | Image | Purpose |
|---|---|---|
| `db` | `postgres:16-alpine` | The database. Data lives in the `pgdata` volume. Its healthcheck gates the backend |
| `backend` | multi-stage build: `golang:1.23-alpine` → `alpine:3.20` (non-root) | The `leavedesk` binary. Runs migrations on start and stores files in the `uploads` volume |
| `frontend` | multi-stage build: `node:20-alpine` (`tsc -b && vite build`) → `nginx:alpine` | Serves the UI and proxies `/api/`. The only published port, `3000:80` |

nginx allows 6 MB request bodies for 5 MB attachments. It re-resolves `backend` through Docker's DNS on every request, and serves `.mjs` files as JavaScript for the PDF worker.

## 7. Known limitations

- There are no email notifications; people check the app for decisions.
- There is no deactivation or offboarding flow, and there is no approval step for new accounts: anyone who can reach the sign-up page can create an employee account. Set `ALLOWED_EMAIL_DOMAINS` to restrict sign-ups to the company's email domain.
- HR promotion and demotion are CLI-only.
- There is a single approval step (employee → HR) with no team-lead step. With only one HR account, HR's own requests can't be decided until a second HR exists.
- There is no password reset. By design HR cannot change passwords, so a forgotten password needs a database operator. That is a gap to close before production.
- A request that crosses New Year counts entirely against the year it starts in.
- The audit log is written for every HR change but is not shown in the UI yet.

## API reference

All endpoints are under `/api`. Errors look like `{"error": "CODE", "message": "human text"}`, with status 400 (validation), 401, 403, 404 or 409 (conflict).

| Method & path | Who |
|---|---|
| `GET /health` | public |
| `GET /auth/bootstrap` · `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` | public |
| `GET /auth/google/start` · `GET /auth/google/callback` | public (only when configured) |
| `GET /me` · `PATCH /me` · `POST /me/password` · `GET /me/balances?year=` | signed in |
| `GET /requests?scope=mine\|all&status=&type=&department=&q=&from=&to=&year=&page=&pageSize=` | signed in (`scope=all`: HR) |
| `POST /requests` (JSON or multipart with `attachment`) · `GET /requests/{id}` · `PATCH /requests/{id}` · `POST /requests/{id}/cancel` | signed in; owner or HR |
| `POST /requests/{id}/decision` · `GET /requests/{id}/overlaps` · `GET /requests/export.csv` | HR |
| `GET /calendar?month=2026-10&department=&type=&includePending=` | signed in (never returns balances) |
| `GET /hr/employees` · `GET /hr/employees/{id}` · `PATCH /hr/employees/{id}` · `GET /hr/employees/export.csv` | HR |
| `GET /departments` (signed in) · `POST /departments` (HR) | |
| `POST /files` · `GET /files/{id}` | signed in; files are served to the owner or HR, avatars to anyone signed in |
