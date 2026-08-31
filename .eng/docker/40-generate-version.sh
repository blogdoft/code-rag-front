#!/bin/sh
# Runs as one of nginx's docker-entrypoint.d/ scripts (same mechanism as the
# built-in 20-envsubst-on-templates.sh, just targeting a static asset instead
# of an nginx config file), so APP_VERSION - the tag stamped at `docker build`
# time - is readable by the frontend at runtime via GET /version.json, the
# same way nginx.conf.template makes API_UPSTREAM available to nginx itself.
set -eu
envsubst < /etc/nginx/version.json.template > /usr/share/nginx/html/version.json
