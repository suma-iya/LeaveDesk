# Employee Leave Tracker

A full-stack web app where **employees** apply for leave and **managers** approve or reject it.
Managers get a dashboard with pending, approved and rejected counts, the number of requests received on any day, and each employee's leave history.
Users sign in with email and password, or with **Google**. Every API call is protected by a **JWT**.

- **Backend:** Go (standard-library `net/http`), PostgreSQL
- **Frontend:** React + Vite, Tailwind CSS, shadcn/ui
- **Runs with:** `docker compose up` (3 containers: `frontend`, `backend`, `db`)

> The written explanation of the architecture, code components, API internals and Docker setup is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Features

| Employee | Manager |
|---|---|
| Sign in with email/password or Google | Sign in with email/password or Google |
| Apply for leave (Annual, Sick, Casual, Unpaid) | **Dashboard:** pending, approved and rejected counts, employee count, who is on leave |
| See own requests and their status | **Requests received on a chosen day** (count + list, defaults to today) |
| Cancel a request while it is still pending | **Approve / reject** pending requests with an optional comment |
| Summary cards: pending, approved, rejected, days off this year | **All requests**, filtered by status, employee and submission date |
| | **Employees CRUD** with per-employee leave counts |
| | **Each employee's leave list** with a yearly summary |

Business rules enforced by the server:
- The end date cannot be before the start date.
- Only sick leave may start in the past.
- A new request cannot overlap one of the employee's own pending or approved leaves. A Postgres exclusion constraint enforces this too, so it holds even for simultaneous requests.
- Only employees file leave, so a manager can never approve their own request.
- Only `PENDING` requests can be approved, rejected or cancelled. The check is atomic, so two managers clicking at the same moment cannot both win.
- Employees can only see and cancel their **own** requests. Manager endpoints return `403` for employees.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| API | Go 1.23, `net/http` (Go 1.22+ method routing such as `GET /api/employees/{id}`) | No framework needed. Small, fast, easy to explain |
| DB driver | `pgx/v5` with a connection pool | The standard high-performance Postgres driver for Go |
| Auth | `golang-jwt/jwt/v5` (HS256), `bcrypt`, Google ID token verification | Token-based sessions, safe password storage, Google sign-in |
| Database | PostgreSQL 16 | Relational data with foreign keys, CHECK constraints and date math |
| UI | React 19 + React Router 7, built by Vite | Component model with client-side routing |
| Components | shadcn/ui (Radix primitives) + Tailwind CSS v4 | Accessible components with consistent styling |
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

On first start, the backend creates the tables and seeds demo data:

| Role | Email | Password |
|---|---|---|
| Manager | `manager@example.com` | `manager123` |
| Employee | `alice@example.com` | `password123` |
| Employee | `bob@example.com` | `password123` |
| Employee | `chitra@example.com` | `password123` |

The login page has buttons that fill these in. Set `SEED_DEMO_DATA=false` to start with only the manager account.

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

When `GOOGLE_CLIENT_ID` is empty, the button is hidden and the password login still works.

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

Open http://localhost:5173. Vite proxies `/api` to `localhost:8080`, just as nginx does in Docker.

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
    ├── Dockerfile              # multi-stage: node build → nginx
    ├── nginx.conf              # static files + /api reverse proxy
    └── src/
        ├── api.js              # the only file that calls fetch()
        ├── context/AuthContext.jsx
        ├── hooks/useAsync.js   # loading / error / data for every page
        ├── components/         # layout, tables, dialogs, badges (+ ui/ from shadcn)
        └── pages/              # Login, MyLeaves, ManagerDashboard, LeaveRequests, Employees, EmployeeDetail
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

- **One origin.** The browser only talks to nginx, so there is no CORS setup and the API port is never published.
- **Layered backend.** A handler parses HTTP, a service applies rules, a repository runs SQL. Services depend on interfaces, which is how they are unit-tested with fakes.
- **JWT auth.** Login returns a signed JWT holding the user id. On every request the middleware verifies the signature and loads the user, so a deleted account is locked out at once and the role always comes from the database.
- **Google sign-in.** The browser gets an ID token from Google, and the backend verifies it with Google (checking that it was issued for this app's client ID). The backend then finds, links or creates the user and issues **its own** JWT, so both login methods end in the same kind of session.

### Brief explanation of inner workings

An approval shows how the pieces fit together:

1. The manager clicks **Approve**. `ReviewActions.jsx` calls `reviewLeave(id, 'APPROVED', comment)` in `api.js`.
2. `api.js` sends `PATCH /api/leaves/42/status` with `Authorization: Bearer <jwt>`.
3. nginx forwards the request to `backend:8080`.
4. `Logger` starts a timer. `Authenticate` verifies the JWT signature and expiry, loads the user (and their current role) and puts them in the request context. `RequireRole(MANAGER)` checks the role.
5. `handler.ReviewLeave` reads `{id}` and decodes the JSON body. It rejects unknown fields and bodies over 1 MB.
6. `LeaveService.Review` validates the status (only `APPROVED` or `REJECTED`) and calls the repository.
7. The repository runs `UPDATE leaves SET status=$1 … WHERE id=$4 AND status='PENDING'`. If 0 rows change, the service works out whether the leave doesn't exist (`404`) or was already reviewed (`409`).
8. The handler writes the updated leave as JSON. The UI shows a toast and reloads the dashboard numbers.

The full walkthrough, including login and Google flows, the schema, the API table, the error mapping and the Docker details, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API reference

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
