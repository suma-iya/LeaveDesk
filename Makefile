# Shortcuts for the docker-compose stack.
.PHONY: up down reset seed test logs

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
