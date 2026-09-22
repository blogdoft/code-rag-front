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

# APP_VERSION is the git tag docker-publish.yml builds this image from (see that
# workflow's --build-arg). Baked in as an image ENV (not just a build ARG) so it's
# still readable at container start by 40-generate-version.sh below, which turns it
# into /version.json - fetched by the frontend at runtime instead of being compiled
# into the JS bundle, so the same static bundle works no matter how it's tagged.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
COPY .eng/docker/version.json.template /etc/nginx/version.json.template
COPY .eng/docker/40-generate-version.sh /docker-entrypoint.d/40-generate-version.sh
RUN chmod +x /docker-entrypoint.d/40-generate-version.sh

# auth-config.json tells the frontend whether Keycloak login is required (see
# .specs/2026-09-21-keycloak-conditional-login.md). Unlike APP_VERSION above, the KEYCLOAK_* vars
# are plain runtime env vars (docker-compose/k8s), not build args - deployment-specific, not
# image-specific - so there's no ARG/ENV pair here; 41-generate-auth-config.sh reads them straight
# from the container's environment at start, defaulting to disabled if unset.
COPY .eng/docker/auth-config.json.template /etc/nginx/auth-config.json.template
COPY .eng/docker/41-generate-auth-config.sh /docker-entrypoint.d/41-generate-auth-config.sh
RUN chmod +x /docker-entrypoint.d/41-generate-auth-config.sh

EXPOSE 80
