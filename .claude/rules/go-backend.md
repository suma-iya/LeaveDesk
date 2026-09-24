---
paths: ["backend/**/*.go"]
---
- Standard library net/http only; no frameworks.
- Handlers parse and validate input only. Business logic goes in services. SQL goes in repositories.
- Always return JSON errors: {"error": "message"}.
- Wrap errors with fmt.Errorf("context: %w", err).
- Hash passwords with bcrypt; never log passwords or tokens.
  