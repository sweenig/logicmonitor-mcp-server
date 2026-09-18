# The portal-manager scripts shell out to `docker`/`docker compose` against
# the HOST's daemon (Docker-outside-of-Docker via the mounted socket - see
# docker-compose.yml for this service). Grab the real CLI binaries from the
# official image rather than apt's (often stale/incompatible) docker.io package.
FROM docker:27-cli AS dockercli

FROM python:3.12-slim

# bash: the portal-manager/*.sh scripts require it (not sh/dash compatible).
# openssl: used directly by lib.sh for the secrets-at-rest encryption.
# curl: used by lib.sh's wait_for_healthy to poll a portal's /healthz.
# jq: used by lib.sh's upsert_mcp_json_entry to auto-update .mcp.json.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash openssl curl ca-certificates jq \
    && rm -rf /var/lib/apt/lists/*

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

# Run as a non-root user by default. docker-compose.yml overrides the actual
# UID/GID at runtime (via `user:`, sourced from webui/.env) to match the host
# user that owns the bind-mounted repo, plus the host's `docker` group (via
# `group_add:`) so it can use the mounted docker.sock - see docker-compose.yml.
# Without that override, root would own every file this container writes onto
# the bind-mounted host repo (portal .env.enc, docker-compose.yml), making
# them unreadable/unwritable from the host side (this happened in practice:
# portals created via this UI became unreadable by
# portal-manager/list-portals.sh run from the host, and the permission
# failure was silently swallowed rather than erroring - see lib.sh). The
# UID/GID this useradd assigns don't matter - compose's `user:` always
# overrides them at runtime; this is just a non-root fallback if the image is
# ever run without that compose file.
RUN useradd -m -s /bin/bash appuser

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

USER appuser

EXPOSE 5050
CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "2", "app:app"]
