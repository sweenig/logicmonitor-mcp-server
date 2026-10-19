# lm-mcp

## Build and test: use containers, not the host

Node/npm are not installed on the host shell, and the host `node_modules` is incomplete. Never run `npm`/`npx`/`tsc` directly; run them in a throwaway `node:22` container against a copy of the repo (keeps the host tree untouched):

```bash
docker run --rm -v /home/sweenig/lm-mcp:/src:ro node:22 sh -c \
  "mkdir /work && cd /src && tar cf - --exclude=node_modules --exclude=build --exclude=.git . | tar xf - -C /work \
   && cd /work && npm ci --ignore-scripts >/dev/null 2>&1 && npx tsc --noEmit && npm test"
```

`src/servers/auth.e2e.test.ts` needs a `build/` directory, so it fails in that copy; that is expected.

## Rebuild and restart a portal container

Portals run from the shared image `logicmonitor-mcp-server:latest` (the Dockerfile runs `tsc` during `npm ci`, so a type error fails the build). `start-portal.sh` does not rebuild an existing image, so rebuild first:

```bash
docker build -t logicmonitor-mcp-server:latest /home/sweenig/lm-mcp
/home/sweenig/lm-mcp/portal-manager/start-portal.sh --name <portal>   # e.g. amsobservability
```

Only the portal you name is recreated; the others keep running the old image until restarted. Only restart the portal the user asks for.
