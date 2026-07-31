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

## Commands

| Intent | Command |
|--------|---------|
| Install | `pnpm install` |
| Web dev | `pnpm --filter @epiton/web dev` |
| Lint | `pnpm lint` / `pnpm lint:fix` |
| Unit tests | `pnpm test` |
| Web build | `pnpm --filter @epiton/web build` |
| Bundle budget | `pnpm check:bundle` |
| Lab up (Tryton 7) | `pnpm lab:up` |
| Lab up (Tryton 8) | `pnpm lab:up:8` |
| Lab down | `pnpm lab:down` |
| RPC smoke (shell) | `pnpm lab:smoke` |
| RPC smoke (live client) | `pnpm lab:smoke:live` |
| Gateway health | `pnpm gateway:smoke` |
| GH model probe | `pnpm gh:check` |
| Gateway tests | `cd apps/gateway && cargo test` |
| E2E (optional) | `pnpm test:e2e` |

## Batch sizing

Prefer one closed flow per commit, for example:

- Protocol helper + unit test + web wire + COMPATIBILITY row
- UI primitive + workspace consumer + ui vitest
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
- **CI (`.github/workflows/ci.yml`):** same plus gateway cargo + lab-smoke on push/PR.
- Agents should not wait on Actions for every iteration; fix locally first.

## “Continua” pattern

When the user says **continua** and scope is “next P1 parity”:

1. Pick the next gap from `COMPATIBILITY.md` / latest audit recommendations.
2. Implement + gates.
3. Update docs rows.
4. Commit (and push only if the session rule expects it).

Do not edit Cursor plan files unless the user points at them.

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
