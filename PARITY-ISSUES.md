# Upstream issues — Playground CLI / `@parity/product-sdk`

These are the **root-cause** bugs that the in-repo PR ([#1, offline dev mode](https://github.com/sacha-l/rock-paper-scissors-c75b69/pull/1)) **cannot** fix, because they live in the closed `pg`/`playground` binary and the `@parity/product-sdk-*` packages, not in the template. Filed here so they can be lifted into the appropriate Parity repo verbatim.

Context: toolchain `playground`/`pg` 0.33.1, `cdm` 0.8.21, `@parity/product-sdk` 0.9.0, node v25. Full session evidence in `DEPLOY-LOG.md` and `DEVEX-REPORT.md`.

---

## P0 — `pg deploy` cannot complete in any non-interactive / agent-driven context

**Two independent blockers, both required to ship a mod:**

1. **Default-valued prompt crashes on non-TTY stdin.** Omitting `--buildDir` drops into an interactive prompt that hard-fails instead of accepting its default:
   ```
   Raw mode is not supported on the current process.stdin
   ```
   Repro: `pg deploy --contracts --playground --moddable --domain <d> --signer phone` (no `--buildDir`), stdin not a TTY → exit 1 at `build directory ›`.

2. **`--signer phone` renders a QR per signature and needs a TTY.** Even past (1), each of the ~4 deploy txs (reserve domain → finalize → link content → publish) renders a QR the phone scans. Backgrounded / headless, it can't render and **hangs at the first signature** (observed: stalled at `contracts deploy + install`, nothing signed, killed exit 144).

**Impact:** No coding agent — and no CI — can complete a deploy. The one irreversible, ownership-binding step is also the one step that can't be automated or pre-tested. This is the core conflict with the "fork → mod → redeploy, easily" promise.

**Asks (in priority order):**
- **Session-key deploy.** The session key already provisioned by `pg init` should authorize the deploy txs within a funded allowance, so there is **no per-tx QR at all** — making the flow seamless *and* agent-drivable. This is the real target.
- **Fully non-interactive mode.** Every prompt available as a flag, plus `--yes` / `--ci`, and no raw-mode requirement when stdin isn't a TTY (accept defaults instead of crashing).
- **Fallback if a human signature is genuinely required:** emit the signing request as a deep-link / QR-image artifact an agent can surface out-of-band, rather than a blocking inline TTY render.

---

## P0 — Registry has no `getOwner(name)`; claimability is unverifiable before signing

`cdm install` / `getAddress` only tells you whether a contract *address resolves*, not whether a *name is owned*. A name can read `Contract "…" not found in registry` and **still be owned** by someone else — so you cannot verify claimability before burning phone approvals on a deploy that then fails with `already owned by 0x…`.

Concretely this session: `@whiterabbit-rps` and `@whiterabbit-rubicon` both returned "not found" yet one had already been rejected at deploy as owned by `0x35cdb…`.

**Ask:** add `getOwner(name)` to the registry and a `pg`/`cdm name check <name>` command, so an ownership preflight can run **before** signing:
> *"You're about to claim `@X/leaderboard` under account `0x…`. Status: {free / owned by you / owned by someone else}."*
> If owned by someone else, lead with the **signer** fix, not a rename.

---

## P1 — Deploy error guidance points at the wrong variable

The collision error leads with *"Update the Cargo.toml package value to a name you own"* and buries *"or deploy with the owner account"* second. Ownership is bound to the **signer identity**, not the name — but the error optimizes for the name. A human (and a coding agent, twice this session) follows the primary suggestion, renames, redeploys under the same wrong signer, and collides again under a new name.

**Ask:** when a name is owned by another account, lead the error with the signer/ownership fix. Surface the active signer identity in the error (it is currently invisible — never written to the repo, churned `0x9621…` → `0xcf8a…` across the session while the owner stayed `0x35cdb…`).

---

## P1 — `--signer dev` silently falls back to a shared public mnemonic

`--signer dev` with no `--suri` uses a shared, publicly-known dev mnemonic. Anyone using it claims names under one shared address (and could own *your* contract).

**Ask:** require `--suri` with `--signer dev`, or fail loudly with a warning. No silent shared key.

---

## P2 — No read-only `pg whoami`

There is no way to ask "am I logged in, and as whom" without running the full `pg init` flow (which also can't surface a fresh QR without `pg logout` first). An agent must run all of `init` just to discover identity.

**Ask:** a read-only `pg whoami` returning the logged-in account + username.

---

## P2 — Contract package name is duplicated across hand-synced files

The name lives in `Cargo.toml`, `cdm.json` (×2) and `src/utils.ts` (×2). Miss one → runtime resolve failure, not a build error. (The template-side half of this is addressed in PR #1 by deriving the name from `cdm.json`; the Rust/`Cargo.toml` copy remains.)

**Ask:** auto-derive the CDM package name from the authenticated account at deploy time, or provide a single source of truth the build reads.

---

## Reference implementation — make this the template default

The template-side half of the pain (ownership collision + no way to verify a mod
without deploying) is already solved in this repo and should be lifted into the
**original moddable template** (`paritytech/Rock-Paper-Scissors`) so every `pg
mod` inherits it.

> **Status:** the collision fix (`npm run name:new` + single-source name) is
> submitted upstream as **[paritytech/Rock-Paper-Scissors#11](https://github.com/paritytech/Rock-Paper-Scissors/pull/11)**.
> The offline dev mode is offered there as a follow-up.

1. **Auto-claim a unique contract name.** `npm run name:new`
   (`scripts/new-contract-name.mjs`) generates a high-entropy, unowned name and
   rewrites `cdm.json` + `contracts/leaderboard/Cargo.toml`. The frontend derives
   the name from `cdm.json` at runtime, so there is one source of truth.
   → The template should **run this automatically as part of `pg mod`** (or first
   `npm install`), so a freshly-modded app can never ship a pre-owned name.
   Fixes #1, #3, #5 at the template level — no `getOwner` required.

2. **Offline dev mode.** `http://localhost:3000/?mock` runs the whole app
   (register / Solo / leaderboard / profile) against an in-memory contract — no
   chain, phone, funding or ownership binding (see `src/utils.ts`,
   `createDevLeaderboard`). This closes the verification loop (#9 in
   DEVEX-REPORT.md): a developer or coding agent can confirm a mod works *before*
   the irreversible deploy.
   → The template should ship this so dev mode is the default for a fresh mod.

With both shipped in the template, the remaining gaps are purely the **CLI/SDK**
items above (P0/P1) — i.e. only the closed tooling needs Parity-side changes; the
template-level experience is already solved here and ready to upstream.
