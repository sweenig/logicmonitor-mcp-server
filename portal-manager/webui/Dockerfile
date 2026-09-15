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

# Run as a non-root user matching the host's UID (1000/sweenig), not root.
# This container writes files (portal .env.enc, docker-compose.yml) directly
# onto the bind-mounted host repo - running as root would make every file it
# creates root-owned and unreadable by the host user or any host-run script
# (this happened in practice: portals created via this UI became unreadable
# by portal-manager/list-portals.sh run from the host, and the permission
# failure was silently swallowed rather than erroring - see lib.sh). The
# extra group (GID 988) matches the host's `docker` group so this user can
# still read/write the bind-mounted docker.sock despite not being root.
RUN groupadd -g 1000 appuser \
    && groupadd -g 988 dockerhost \
    && useradd -u 1000 -g appuser -G dockerhost -m -s /bin/bash appuser

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 5050
CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "2", "app:app"]
