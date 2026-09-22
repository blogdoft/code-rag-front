#!/bin/sh
# Same mechanism as 40-generate-version.sh, targeting a second static asset. Unlike
# APP_VERSION, the four KEYCLOAK_* vars are plain runtime env vars (docker-compose
# environment: / k8s env:), not baked into the image at `docker build` time - whether Keycloak
# is required and which realm/client to use are properties of where this image is deployed, not
# of the image itself. KEYCLOAK_ENABLED defaults to "false" here (not just in the frontend's own
# fallback) so an operator who sets none of these four vars still gets valid JSON out of envsubst
# and a disabled-by-default app - see .specs/2026-09-21-keycloak-conditional-login.md.
set -eu
export KEYCLOAK_ENABLED="${KEYCLOAK_ENABLED:-false}"
export KEYCLOAK_URL="${KEYCLOAK_URL:-}"
export KEYCLOAK_REALM="${KEYCLOAK_REALM:-}"
export KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-}"
envsubst < /etc/nginx/auth-config.json.template > /usr/share/nginx/html/auth-config.json
