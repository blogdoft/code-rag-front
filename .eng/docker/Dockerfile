# Build context is the repo root (see docker-compose.yml), since the Angular
# build needs the full source tree.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx serves the static Angular bundle and reverse-proxies /api to the real
# CodeRAG API, the same job proxy.conf.json does for the Angular CLI dev
# server (see CLAUDE.md). The frontend's own base URL setting is left empty
# (its default) so /api calls stay same-origin and land here.
FROM nginx:1.27-alpine AS runtime
COPY .eng/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/code-rag-front/browser /usr/share/nginx/html

EXPOSE 80
