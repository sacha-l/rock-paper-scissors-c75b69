# PROMPTS.md — agent playbook for modding & deploying a playground dApp

Reusable prompts + hard-won rules so the next agent doesn't repeat this session's
mistakes. Optimized for **fewest tokens** and **doing the right thing**. Not committed yet.

---

## TL;DR rules (read first)

1. **Ownership is bound to the SIGNER, not the name.** CDM package names are global,
   first-deploy-wins, forever. Renaming fixes nothing if you deploy under the wrong
   account. The shipped name belongs to the original author — you must claim your own.
2. **You CANNOT pre-check name ownership.** `cdm install`/`getAddress` only says whether a
   *contract address resolves*, not whether the *name is owned*. A name can read "not
   found" yet still be owned. Pick a **novel** name and accept the deploy is the only
   authoritative check.
3. **A phone-signed `pg deploy` CANNOT be completed by an agent.** Two layers: (a) the
   build-directory prompt crashes on non-TTY (`Raw mode is not supported`) unless you pass
   `--buildDir dist`; (b) even past that, `--signer phone` renders a **QR per signature**
   that the phone scans — that QR needs a real TTY, so a backgrounded/agent run just
   **hangs** at the first signature. → The agent does all prep, then hands the user ONE
   command to run **in their own terminal** where the QR shows. (Or use session-key/`--suri`
   signing where appropriate — see signing options.)
4. **`pg init` is idempotent** — it reuses an existing session and tells you the account.
   Run it once to learn who you are; don't assume you're logged out.
5. **The package name lives in 4 spots** — keep them in sync: `contracts/*/Cargo.toml`
   (`[package.metadata.cdm] package`), `cdm.json` (×2: deps + contracts keys),
   `src/utils.ts` (×2: `libraries:[…]` + `getContract(…)`).
6. **Never `--signer dev` without `--suri`** — bare `dev` uses a shared public mnemonic.

---

## Prompt 1 — Orient (one cheap pass, no guessing)

> Before touching anything, run these read-only checks and report concisely:
> `pg --version && cdm --version`; `pg init` (idempotent — tells me the logged-in account,
> username, allowances, funding); `grep -rn "@[a-z0-9-]*/leaderboard" --include=*.toml
> --include=*.json --include=*.ts . | grep -v node_modules` to find the current contract
> name and all its references. Do not edit yet.

## Prompt 2 — Claim a name you can own (the #1 trap)

> The shipped contract package name is owned by the original author; deploying under it
> fails the ownership check. Rename it to a **novel** name tied to my account/domain (e.g.
> `@<my-handle>-<unique-suffix>/leaderboard`) in all 4 spots with one `sed`, then verify no
> old references remain. Do NOT try to "verify it's free" via `cdm install` — that checks
> resolvability, not ownership, and will mislead you. A fresh unique string is the safe bet.

## Prompt 3 — Build, then hand off the phone-signed deploy

> Build the frontend with `pg build`. The deploy itself is **QR-phone-signed and must run
> in the user's real terminal** — do NOT background it (it hangs at the QR). Do all prep,
> then give the user this exact one-liner to run themselves:
> ```
> pg deploy --contracts --playground --moddable \
>   --domain <my-domain> --signer phone --buildDir dist
> ```
> `--buildDir dist` avoids the build-dir raw-mode crash. Tell them what to expect: a
> preflight summary, then a QR per signature — scan with the Polkadot app: contract deploy
> → reserve domain → ~60s DotNS pause → finalize → link content → publish. On success it
> prints the live `.dot.li` URL + contract address + CIDs; ask them to paste those back.

## Prompt 4 — If the final register step says "already owned by …"

> The novel name was taken after all (you couldn't have known — there's no ownership
> lookup). Pick a different `@<handle>-<suffix>/leaderboard`, re-sync the 4 spots, rebuild,
> redeploy. Don't burn tokens re-checking with `cdm install`; just rename and retry.

---

## Token-efficiency notes

- **Don't** write a registry-query script to "check if a name is free" — it can't tell you
  ownership (proven this session). Skip it; pick a novel name and deploy.
- **Don't** re-`pg init` repeatedly — it's idempotent; one run tells you everything.
- **Don't** background or pipe a `--signer phone` deploy — it renders a QR per signature
  that needs a TTY and will silently hang. Hand it to the user's terminal instead.

## Signing options (looked at all; pick per context)

| Option | Agent-drivable? | Real account / ownership | Security | Use when |
|---|---|---|---|---|
| **`--signer phone` in user's terminal** | No — user runs it; QR per sig | ✅ your real account | ✅ best (key on phone) | **Default for a real published mod** |
| Background `--signer phone` | ❌ hangs at QR | — | — | never |
| `--signer dev --suri <secret>` | ✅ fully non-interactive | ❌ throwaway acct owns your contract | ⚠️ secret in shell/transcript | ephemeral CI/test only |
| Session-key deploy (from `pg init`) | ✅ (would be) | ✅ | ✅ | **not available yet — upstream ask** |

**Best today:** prep everything as an agent, hand the user the `--signer phone` one-liner
for their terminal. **Best target:** session-key-authorized deploys so no per-tx QR.
- **Do** batch the rename (`sed` over all files in one call) and verify with one `grep`.
- **Do** assume the contract ABI in `cdm.json` is stale after a contract edit; the deploy's
  `--contracts` step regenerates it — no need to hand-fix it first.

## Upstream asks (so this playbook can shrink to one command)

1. `pg deploy` must auto-accept prompt defaults in non-TTY mode (or add `--yes`/`--ci`).
2. Registry needs `getOwner(name)` so claimability is checkable before deploying.
3. Auto-derive the CDM package name from the signed-in account (no 4-file rename).
4. A read-only `pg whoami`.
