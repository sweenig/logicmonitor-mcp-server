# Portal Manager

Scripts to run this MCP server against multiple LogicMonitor portals at once,
each as its own container, so you can query more than one portal in the same
conversation instead of switching a single server back and forth.

Each portal gets its own directory under `portal-manager/portals/<name>/`
(gitignored - it holds real credentials) containing:
- `.env` - `LM_COMPANY` (same as the portal name), `LM_BEARER_TOKEN`,
  `MCP_READ_ONLY`, and an auto-generated `MCP_BEARER_TOKEN`.
- `docker-compose.yml` - a single service reusing the shared
  `logicmonitor-mcp-server:latest` image (built once, not per portal), on its
  own host port.

Every portal defaults to `MCP_READ_ONLY=true` and a random `MCP_BEARER_TOKEN`
(so its HTTP endpoint isn't wide open on the network) - both scoped
independently per portal, so one client portal can stay strictly read-only
while a sandbox stays read-write.

## Usage

All scripts work either interactively (just run them, you'll be prompted) or
non-interactively via flags (useful for scripting). Run any script with
`--help` for its full flag list. Bearer tokens are always entered via a hidden
prompt if not passed as a flag - never put a real token directly on the
command line where it could land in shell history.

### Add a portal

```bash
./portal-manager/add-portal.sh
# or
./portal-manager/add-portal.sh --name acme --token "$LM_TOKEN" --readonly true
```

Builds the shared image if it doesn't exist yet, starts the container, waits
for it to report healthy, and prints the `.mcp.json` entry to add (including
the `Authorization` header if a bearer token was generated).

### Edit a portal

```bash
./portal-manager/edit-portal.sh --name acme --readonly false   # e.g. temporarily allow writes
./portal-manager/edit-portal.sh --name acme --rotate-token            # new LM_BEARER_TOKEN
./portal-manager/edit-portal.sh --name acme --rotate-bearer-token     # new MCP auth token
./portal-manager/edit-portal.sh --name acme --port 3010
```

Recreates the container after applying the change(s).

### Remove a portal

```bash
./portal-manager/remove-portal.sh --name acme
```

Stops the container and deletes `portal-manager/portals/acme/` (including its
credentials). Asks you to type the portal name to confirm unless `--yes` is
passed. Does not touch anything in LogicMonitor itself.

### List portals

```bash
./portal-manager/list-portals.sh
./portal-manager/list-portals.sh --json   # for scripting / a future UI
```

## Notes

- The existing top-level `docker-compose.yml`/`.env` (the original
  `logicmonitor-mcp-http` etc. services) are untouched by these scripts -
  portal-manager is purely additive, for portals beyond the first one.
- `.mcp.json` is never edited automatically; each script prints the snippet
  to add so you can review it first.
- These scripts are intentionally the only place the add/edit/remove/list
  logic lives. A future web UI should shell out to them rather than
  reimplementing this logic in another language.
