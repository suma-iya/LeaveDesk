# ---- Build: compile a static binary ----
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/leavedesk ./cmd/leavedesk

# ---- Run: small image with just the binary ----
FROM alpine:3.20
# tzdata for APP_TIMEZONE, ca-certificates for Google sign-in over HTTPS.
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 app \
    && mkdir -p /data/uploads && chown app /data/uploads
USER app
WORKDIR /app
COPY --from=build /out/leavedesk /app/leavedesk
EXPOSE 8080
ENTRYPOINT ["/app/leavedesk"]
CMD ["serve"]
