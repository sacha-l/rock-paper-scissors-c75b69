# Deploy Log — RPS mod via Playground CLI (first-time flow)

Goal: deploy the modded `rock-paper-scissors` app end-to-end with `pg`, phone-signed,
logging every error + fix + upstream mistake. Toolchain: `pg`/`playground` 0.33.1,
`cdm` 0.8.21, node v25. Account in use: `whiterabbit` → `0xcf8a146f…22778`.

## Headline finding — a phone-signed `pg deploy` cannot be agent-driven (two layers)

> 1. **Build-dir prompt crashes on non-TTY** — omitting `--buildDir` → `Raw mode is not
>    supported on the current process.stdin`. Workaround: pass `--buildDir dist`.
> 2. **Signing is QR-per-signature, needs a TTY** — even past (1), `--signer phone` renders
>    a QR for each tx that the phone scans. Backgrounded, it can't render the QR and just
>    **hangs at the first signature** (observed: stalled at `contracts deploy + install`,
>    no QR, nothing signed). So the deploy **must** run in the user's real terminal.
>
> This is the core conflict with "seamless / agent-easy / least-tokens" modding. **Best
> available today:** agent does all prep, user runs the one-liner in their terminal and
> scans the QRs. **Best target (upstream):** the session key already provisioned by
> `pg init` should authorize the deploy txs (within an allowance) so there's **no per-tx
> QR** — making the flow seamless *and* agent-drivable. Failing that, emit the signing
> request as a deep-link/QR-image an agent can surface, and auto-accept prompt defaults
> in non-TTY mode (`--yes`/`--ci`).

### Signing options evaluated

| Option | Agent-drivable | Real account / ownership | Security | Verdict |
|---|---|---|---|---|
| `--signer phone`, user's terminal | No (user scans QR) | ✅ your account | ✅ key on phone | **Best today** |
| `--signer phone`, backgrounded | ❌ hangs at QR | — | — | Non-viable |
| `--signer dev --suri <secret>` | ✅ non-interactive | ❌ throwaway owns your contract | ⚠️ secret exposed | CI/test only |
| Session-key deploy (`pg init`) | ✅ (would be) | ✅ | ✅ | **Best target — not available yet** |

## Step-by-step

| # | Step / command | Observed | Fix / status | Upstream mistake |
|---|---|---|---|---|
| 1 | `pg init` | **No QR** — found existing session: logged in `5FFBNdRN…`, account `playground.dot/0` `0xcf8a…`, username `whiterabbit`, **allowances granted + already funded**, "✓ setup complete" | ✓ Already paired & funded; nothing to do | `pg init` is idempotent (good), but there's no way to *show* a fresh QR without `pg logout` first, and no read-only "am I logged in / as whom" command — an agent must run the full `init` to find out |
| 2 | Identity check | Playground username `whiterabbit` (`0xcf8a…`) **≠** CDM package owner. `@whiterabbit-rps`, `@whiterabbit-rubicon`, `@rps-c75b69` are all owned by `0x35cdb…`, not you | Must use a CDM name free/owned by `0xcf8a…` | Two separate ownership namespaces (playground username vs CDM package) with the same-looking handle is deeply confusing; nothing links or warns |
| 3 | Name availability probe — `cdm i -n paseo --registry-address 0xf62c2… "@whiterabbit-c75b69/leaderboard"` (and `…-rubicon`) | **Both** return `Contract "…" not found in registry` — *including* `@whiterabbit-rubicon`, which the deploy earlier rejected as "owned by 0x35cdb" | Can't trust this as a freeness check; picked the novel string `@whiterabbit-c75b69/leaderboard` | **Ownership ≠ resolvability.** `cdm install`/`getAddress` only tells you if a *contract address resolves*, not whether the *name is owned*. A name reads "not found" yet is still owned → you can't verify claimability before deploy. Registry needs `getOwner(name)` |
| 4 | Rename to `@whiterabbit-c75b69/leaderboard` (4 spots: `Cargo.toml`, `cdm.json`×2, `src/utils.ts`×2) via `sed` | All 5 references updated, no leftovers | ✓ | Name hardcoded in 4 hand-synced files; no single source of truth |
| 5 | `pg build` | Frontend (vite) built clean → `dist/`. (Contract is compiled by the deploy's `--contracts` step.) | ✓ | `pg build` builds the frontend only; contract build is implicit in deploy — unclear from the command name |
| 6a | `pg deploy … --signer phone` (backgrounded, no `--buildDir`) | **FAILED exit 1** at `build directory › `: `Raw mode is not supported on the current process.stdin` | Add `--buildDir dist` | Default-valued prompt crashes instead of accepting its default in non-TTY |
| 6b | `pg deploy … --signer phone --buildDir dist --no-build` (backgrounded) | Got **past** preflight (signer/moddable/4-approvals shown), then **hung at `contracts deploy + install`** — no QR rendered, nothing signed; killed (exit 144) | ✗ Can't complete agent-side. **User runs it in a real terminal**; QR renders, they scan each sig | Phone signing = QR-per-tx needing a TTY; no session-key/non-interactive path → un-automatable |

## The remaining step — you must run this in a real terminal

Everything is prepped: logged in, funded, renamed to a free name, frontend built. Run this
in your own Terminal (a real TTY — not through the agent), and approve the ~4 prompts on
your phone:

```sh
cd "<this repo>"
pg deploy --contracts --playground --moddable \
  --domain rock-paper-scissors-c75b69 --signer phone --buildDir dist
```

What to expect: a preflight summary (confirm `moddable` → your fork
`github.com/sacha-l/rock-paper-scissors-c75b69`, name `@whiterabbit-c75b69/leaderboard`),
then phone approvals: reserve domain → ~60 s DotNS pause → finalize → link content →
publish (+ possible Bulletin top-up). On success it prints your live `https://
rock-paper-scissors-c75b69.dot.li` URL + the contract address + CIDs.

If the final register step still errors `already owned by …`, the novel name was somehow
taken too — pick another `@whiterabbit-<x>/leaderboard`, re-run steps 4–5, and redeploy.
(This is exactly the gap from finding #3 — you can't know until you try.)

## Priorities for upstream (so modding is actually agent-easy + low-token)

1. **Non-interactive `pg deploy`** — every prompt as a flag + `--yes`/`--ci`, no raw-mode
   requirement when stdin isn't a TTY. *Without this, no agent can complete a mod.* (P0)
2. **`getOwner(name)` on the registry** + a `pg/cdm name check` command, so claimability is
   verifiable before burning phone approvals. (P0)
3. **Auto-derive the CDM package name from the signed-in account** so it can't collide and
   needs no 4-file edit. (P1)
4. **A read-only `pg whoami`** (logged-in account + username) so an agent doesn't run full
   `init` to find out. (P2)
5. **Single source of truth for the contract name** in the template. (P2)
