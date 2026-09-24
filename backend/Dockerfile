# ---- Build stage: compile a static Go binary ----
FROM golang:1.23-alpine AS build
WORKDIR /src

# Download modules first so this layer is cached until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ---- Run stage: tiny image with just the binary ----
FROM alpine:3.20
# tzdata: APP_TIMEZONE lookup; ca-certificates: HTTPS call to Google.
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 app
USER app
COPY --from=build /out/api /usr/local/bin/api
EXPOSE 8080
ENTRYPOINT ["api"]
