# lm-mcp

## Build and test: use containers, not the host

Node/npm are not installed on the host shell, and the host `node_modules` is incomplete. Never run `npm`/`npx`/`tsc` directly; run them in a throwaway `node:22` container against a copy of the repo (keeps the host tree untouched):

```bash
docker run --rm -v /home/sweenig/lm-mcp:/src:ro node:22 sh -c \
  "mkdir /work && cd /src && tar cf - --exclude=node_modules --exclude=build --exclude=.git . | tar xf - -C /work \
   && cd /work && npm ci --ignore-scripts >/dev/null 2>&1 && npx tsc --noEmit && npm test"
```

`src/servers/auth.e2e.test.ts` spawns `build/servers/index.js` on ports 13000-13003, so it needs a `build/` directory. `npm test` runs a `pretest` script (`npm run build`) that creates it, so the whole suite should pass in that copy; any failure, including this suite, is real. (`test:watch` and `test:coverage` skip `pretest`; run `npm run build` first for those.)

## Rebuild and restart a portal container

Portals run from the shared image `logicmonitor-mcp-server:latest` (the Dockerfile runs `tsc` during `npm ci`, so a type error fails the build). `start-portal.sh` does not rebuild an existing image, so rebuild first:

```bash
docker build -t logicmonitor-mcp-server:latest /home/sweenig/lm-mcp
/home/sweenig/lm-mcp/portal-manager/start-portal.sh --name <portal>   # e.g. amsobservability
```

Only the portal you name is recreated; the others keep running the old image until restarted. Only restart the portal the user asks for. The exception is the `/deploy` skill (`.claude/skills/deploy/SKILL.md`): invoking it means test, rebuild and restart every running portal (or the ones named); stopped portals stay stopped. It pauses for a VS Code restart, then runs live checks.

## Commit and push

Only after the change is deployed and verified live. When the user says "commit and push": first add a line under `## [Unreleased]` in `CHANGELOG.md` (matching the surrounding style) and update `context_data/mcp_server_todo.md` (mark the item DONE in the table and move it under "Done", or add a new entry), then commit straight to main, staging files by name, and push.
