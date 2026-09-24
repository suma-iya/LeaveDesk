---
name: new-page
description: Build one frontend page or component for the leave tracker using shadcn/ui. Use when I ask for a page, form, table, dashboard or UI component.
---
Build the page I describe in frontend/src/pages/.

Rules:
- Use shadcn/ui components only (Button, Card, Table, Badge, Dialog, Input, Label, Select, Sonner for toasts). Install missing ones via the shadcn MCP; never hand-write their code.
- Layout: Tailwind utility classes; clean, spacious admin-dashboard style; must work on mobile.
- Status badges: PENDING = yellow, APPROVED = green, REJECTED = red.
- Data: call the API through functions in src/api.js only; never call fetch inside a component.
- Handle three states on every page: loading, error, empty.
- Show ADMIN-only actions (approve/reject) only when user.role === "ADMIN".

When done:
1. List files created or changed.
2. Explain how data flows: page → api.js → nginx /api → Go handler, and back.
3. Suggest a commit message. Stop and wait for me.
