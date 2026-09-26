# ---- Build stage: type-check and bundle the React app ----
FROM node:20-alpine AS build
WORKDIR /app

# Dependencies first, so this layer is cached until package*.json change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve stage: nginx serves dist/ and proxies /api to the backend ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
