# lm-mcp

A Model Context Protocol (MCP) server for LogicMonitor, written in TypeScript (Node 18+). It exposes LogicMonitor's REST API as MCP tools, plus knowledge resources and prompts, over STDIO, SSE or streamable HTTP. See `README.md` for features, configuration and the Portal Manager.

## Layout

- `src/api/`: tool definitions (`tools.ts`), request handlers (`handlers.ts`) and the LogicMonitor client (`client.ts`).
- `src/servers/`: the server and transports, authentication and the entry point (`index.ts`).
- `src/utils/`: helpers and shared utilities.
- `portal-manager/`: scripts and web UI for running one container per LogicMonitor portal.

## Build and test

```bash
npm ci
npm run build     # tsc
npm test          # runs the build first (pretest), then jest
```

`src/servers/auth.e2e.test.ts` starts `build/servers/index.js` on ports 13000-13003, so the build must exist; `npm test` takes care of that. `npm run test:watch` and `npm run test:coverage` skip the build, so run `npm run build` first.

## Conventions

- Add an entry under `## [Unreleased]` in `CHANGELOG.md` for each user-visible change.
- New or changed tool arguments need a matching update to the tool's `inputSchema` and description in `src/api/tools.ts`, plus a handler test.
