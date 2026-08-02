# Epitón agent loop

Daily speed path for agents. Authority and rails live in
[`AGENTS.md`](../AGENTS.md) and [`GOVERNANCE.md`](GOVERNANCE.md).

## Default loop

```text
1. Read AGENTS.md + relevant specialist doc (COMPATIBILITY / TOOLING / CANON)
2. Inspect the owning package only
3. Implement the smallest batch that closes a verifiable flow
4. pnpm lint:fix && pnpm lint
5. pnpm test   (or focused vitest in the touched package)
6. pnpm --filter @epiton/web build && pnpm check:bundle
7. Update COMPATIBILITY / TOOLING if status or deps changed
8. Commit (when user asked / session pattern expects ship)
```

For frontend decomposition, extract the smallest pure translator/policy with a
focused test, then a typed presentational component. Keep session-bound Tryton
RPC, query invalidation, and workflow ownership in the existing coordinator;
leaf UI components receive callbacks and must not create a second runtime.

For nested relation work, read
[`CHILD_SCREEN_CONTRACT.md`](CHILD_SCREEN_CONTRACT.md) before editing
`RelationLineForm`, `RelationLinesEditor`, or another relation host. Those hosts
must consume the frozen child lifecycle, keep RPC/server validation outside
`view-engine`, and bubble every accepted child into the parent queue instead of
writing it independently.

## Commands

| Intent | Command |
|--------|---------|
| Install | `pnpm install` |
| Web dev | `pnpm --filter @epiton/web dev` |
| Lint | `pnpm lint` / `pnpm lint:fix` |
| Unit tests | `pnpm test` |
| Web build | `pnpm --filter @epiton/web build` |
| Bundle budget | `pnpm check:bundle` |
| Next production build | `pnpm check:next` |
| Next production CSP/PWA browser receipt | `pnpm test:e2e:next` |
| Capacitor Android sync | `pnpm --filter @epiton/mobile sync:android` |
| Android debug APK | `pnpm --filter @epiton/mobile build:android:debug` (JDK + Android SDK) |
| Tauri Linux bundles | `pnpm --filter @epiton/desktop build:linux` (Rust + Linux WebKit) |
| Lab up (Tryton 7) | `pnpm lab:up` |
| Lab up (Tryton 8) | `pnpm lab:up:8` |
| Lab down | `pnpm lab:down` |
| RPC smoke (shell) | `pnpm lab:smoke` |
| RPC smoke (live client) | `pnpm lab:smoke:live` |
| Live compat matrix | `pnpm compat:live` |
| Offline compat fixtures | `pnpm --filter @epiton/compat test` |
| Client persistence boundary | `pnpm --filter @epiton/compat test -- client_persistence_contract.test.ts` |
| Gateway health | `pnpm gateway:smoke` |
| GH model probe | `pnpm gh:check` |
| Tryton 9 official-source canary | `pnpm tryton:canary:9` |
| Canary contract tests | `pnpm check:tryton-canary` |
| Gateway tests | `cd apps/gateway && cargo test` |
| Mock browser E2E | `pnpm test:e2e:mock` |
| Disposable live browser E2E | `EPITON_E2E_LAB=disposable pnpm test:e2e:live` |
| Proteus oracle (7 / 8) | `pnpm lab:oracle:7` / `pnpm lab:oracle:8` |

## Batch sizing

Prefer one closed flow per commit, for example:

- Protocol helper + unit test + web wire + COMPATIBILITY row
- UI primitive + workspace consumer + ui vitest
- Pure workspace policy + focused vitest + typed leaf component
- Gateway ACL tweak + cargo test + gateway README note

Avoid mega-batches that mix license policy, GH lab images, and unrelated UI.

## When to hit the lab

| Change | Lab needed? |
|--------|-------------|
| Pure docs / UI CSS | No |
| PYSON / view parse unit tests | No (fixtures enough) |
| New RPC method shape | Yes — `lab:smoke:live` if docker available |
| Board/graph against real arch | Yes — preferred |
| Gateway proxy behavior | Gateway container or local cargo + upstream |

If docker is unavailable, ship with unit tests and note “lab not run” in the
delivery; do not fake live results.

## CI vs local

- **Local loop:** lint → test → web build → bundle.
- **CI (`.github/workflows/ci.yml`):** same plus mock and Next production
  browser receipts, locked gateway cargo, Android debug APK and Linux Tauri
  bundles, and Tryton 7/8 protocol/oracle/live-browser gates on push/PR.
- **Scheduled canary (`tryton-upstream-canary.yml`):** checks official PyPI,
  Tryton documentation, and container signals for 9.0. A release alert means
  “build and prove the 9.0 lab lane,” never “claim support.” Follow every
  activation requirement in `config/tryton-series-policy.json`.
- Agents should not wait on Actions for every iteration; fix locally first.

## “Continua” pattern

When the user says **continua** and scope is “next P1 parity”:

1. Pick the next gap from `COMPATIBILITY.md` / latest audit recommendations.
2. Implement + gates.
3. Update docs rows.
4. Commit (and push only if the session rule expects it).

This development program is Codex-only unless the user explicitly reverses that
instruction. Do not consult or reactivate Cursor bridge/plan state implicitly.

## Stop and ask

Ask the human before:

- Claiming PHI / clinical compliance
- Adding a previously rejected core library
- Production deploy or secret use
- Importing third-party GPL UI sources
- Destructive git (`reset --hard`, force-push)

## Definition of done

A batch is done when:

- [ ] Behavior matches the stated goal
- [ ] Gates above are green (or lab gap explicitly noted)
- [ ] Canon docs updated if status/deps/authority changed
- [ ] No PHI, no session tokens, no Sao paste in the diff
- [ ] No implicit durable client state or backend identifiers in URL/history;
      logout, authenticated 401, and lifecycle teardown purge projections
- [ ] Production browser traffic remains same-origin through the gateway
