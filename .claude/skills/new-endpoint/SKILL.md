---
name: new-endpoint
description: Add one REST endpoint to the Go backend. Use when I ask for a new API route or backend feature.
---
Add the endpoint I describe, following handler → service → repository.
1. Repository: SQL only, parameterized queries ($1, $2), no business logic.
2. Service: validation and business rules (e.g. only PENDING leaves can change status; end date >= start date).
3. Handler: decode JSON, call service, write JSON; map errors to 400/401/403/404/500.
4. Register the route in main.go; wrap with auth middleware and the role check if needed.
5. Write a table-driven test for the service function.
Then show a curl example, explain the request flow, suggest a commit message, and stop.
