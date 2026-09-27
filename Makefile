# Shortcuts for the docker-compose stack.
.PHONY: up down reset seed test logs e2e-up e2e e2e-down screenshots

up:
	docker compose up --build -d

down:
	docker compose down

# Deletes the database and uploaded files.
reset:
	docker compose down -v

# Replaces all data with the demo data set.
seed:
	docker compose exec backend /app/leavedesk seed --reset

test:
	docker run --rm -v "$(CURDIR)/backend":/src -w /src golang:1.23-alpine sh -c "go vet ./... && go test ./..."

logs:
	docker compose logs -f backend

# End-to-end tests (Playwright) run against a separate stack: project
# "leavedesk-e2e", UI on :3100, its own database. Your dev stack and data are
# never touched. The override file (which publishes Postgres) is skipped.
E2E = FRONTEND_PORT=3100 docker compose -p leavedesk-e2e -f docker-compose.yml

e2e-up:
	$(E2E) up --build -d --wait

# Starts (or rebuilds) the e2e stack, then runs every browser test on fresh demo data.
e2e: e2e-up
	cd frontend && npm run e2e

# Deletes the e2e stack and its database.
e2e-down:
	$(E2E) down -v

# README screenshots from the running app (make up && make seed first).
# BASE_URL=http://localhost:3100 make screenshots uses another stack.
screenshots:
	cd tools/screenshots && ([ -d node_modules ] || npm ci) && npx playwright install chromium && npx playwright test
