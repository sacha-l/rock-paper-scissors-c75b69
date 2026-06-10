# DevEx Report — Modding & Deploying a Playground dApp

**App:** rock-paper-scissors (modded from `rock-paper-scissors.dot`)
**Session date:** 2026-06-10
**Toolchain:** `playground`/`pg` 0.33.1 · `cdm` 0.8.21 · node v25.1.0
**SDKs:** `@parity/product-sdk` 0.9.0 · `-contracts` 0.7.0 · `-tx` 0.2.7 · `polkadot-api` 2.1.3

---

## 1. Executive summary

The promise of the playground is: **fork a dApp → mod it → redeploy it, easily.**
In practice the contract-ownership model breaks that promise in a way that is
*structurally invisible* until the last, irreversible step.

> **Root cause (one sentence):** CDM contract ownership is bound to the *signer
> identity*, but every surface a developer (or coding agent) can see — the error
> text, the mod scaffold, the repo files, the docs — frames the problem as a
> *naming* problem. So everyone fixes the name, redeploys under the same wrong
> signer, and collides again under a new name.

This report documents every hiccup hit this session, explains why a coding agent
misdiagnosed it as a naming problem (twice), and proposes an out-of-the-box fix
built around a **dev mode (dummy keypair) + live mode (connected account) +
funding prompts** model.

---

## 2. The hiccup log

| # | Error / Issue / Bug | Severity | Version | Status | Workaround |
|---|---|---|---|---|---|
| 1 | **Bug** — `pg deploy` fails: CDM package `@…/leaderboard` "already owned by 0x35cdb…, selected signer maps to 0xcf8a…". Blocks all contract deploys. | **Critical** | pg 0.33.1 / cdm 0.8.21 | Open (upstream) | Rename to an unowned name **and** sign under your own account. |
| 2 | **Issue** — Error guidance is misleading: it leads with "rename the package to one you own" and buries "or deploy with the owner account." Points at the wrong lever. | **High** | cdm 0.8.21 | Open | Recognize the *signer*, not the name, is the real fix. |
| 3 | **Bug** — The `pg mod` scaffold auto-renamed the package to `@whiterabbit-rps/leaderboard`, **another upstream-owned name**. The scaffold creates a false sense that naming was handled. | **High** | pg 0.33.1 (`mod`) | Open | Manually pick a brand-new name. |
| 4 | **Bug** — ABI drift: the mod changed the contract (`updateResult(string,int64)` → `add_points(int64)`, dropped CID) and updated the frontend, but `cdm.json` still shipped the **old** ABI. No mismatch warning. | **High** | template | Fixed on deploy | `pg deploy --contracts` regenerates `cdm.json`'s ABI. |
| 5 | **Issue** — The package name is hardcoded in **4 hand-synced locations** (`Cargo.toml`, `cdm.json` ×2, `src/utils.ts` ×2). Miss one → runtime resolve failure, not a build error. | **Medium** | template | Open | `grep -rn` + `sed` across all four. |
| 6 | **Bug** — `pg deploy` run from the monorepo parent throws `No library specified and no dependencies found in cdm.json` — a "signing failed" banner that has nothing to do with signing. | **Medium** | pg 0.33.1 | Open | Run from the app dir, or pass `--dir`. |
| 7 | **Issue** — Signer identity is invisible and unstable. It is surfaced nowhere in the repo, was never persisted, and churned across the session (`0x9621…` → `0xcf8a…`) while the owner stayed `0x35cdb…`. | **High** | pg 0.33.1 | Open | `pg init` once; don't switch accounts. |
| 8 | **Bug** — `--signer dev` with no `--suri` silently falls back to a **shared, publicly-known mnemonic**. Anyone using it claims names under one shared address. | **High** | pg 0.33.1 | Documented only | Always `--signer phone`, or `--signer dev --suri <yours>`. |
| 9 | **Issue** — **No dev/offline mode.** There is no way to run or verify a mod end-to-end without a real, funded, phone-signed, ownership-binding deploy. Deploy is the *only* way to discover the conflict. | **High** | template / pg | Open | None — must deploy to test. |
| 10 | **Issue** — No funding/allowance prompt. Missing PAS / Bulletin allowance surfaces as cryptic chain errors (`InvalidTxError {"Payment"}`, `AccountUnmapped`) instead of a UI prompt. | **Medium** | template | Open | Pre-fund via faucets (see `DEPLOYMENT.md` step 2). |
| 11 | **Issue** — `cdm.json` ships stale placeholder `address`/`metadataCid`. Harmless (live resolution) but confusing. | **Low** | template | Cosmetic | Ignore; rewritten on deploy. |
| 12 | **Issue** — App shows no data in a plain browser; requires the Polkadot host / `.dot.li`. | **Low** | template | Documented | Open in Polkadot Desktop or via `.dot.li`. |

---

## 3. Why a coding agent didn't catch this when we modded the app

This is the important question, because it tells you where the DevEx fails for the
*automated* fork-and-mod path the playground is trying to enable. Five concrete
reasons:

1. **The error text itself leads you the wrong way.** The deploy error's first
   suggestion is *"Update the Cargo.toml package value to a name you own,"* with
   *"or deploy with the owner account"* second. A coding agent (and the previous
   fix in `FIXLOG.md`) does the obvious thing: follows the primary suggestion and
   renames. The error optimizes for the wrong variable.

2. **The signer is invisible from the repo; the name is everywhere.** The package
   name lives in 4 files an agent can read. The signer lives in a phone session /
   ambient CLI state that is **never written to the repo** (no `~/.cdm/accounts.json`
   was even present, no deploy identity logged). When you can see one variable and
   not the other, you tune the one you can see.

3. **The scaffold pre-baked a name that looks handled but isn't.** `pg mod`
   auto-renamed to `@whiterabbit-rps/…` — an upstream-owned name. An agent
   reasonably reads "the scaffold set my package name" as "naming is taken care of,"
   when in fact it planted the exact collision.

4. **Ownership is global on-chain state with no local preflight.** Whether a name
   is free, yours, or someone else's is registry state an agent cannot observe by
   reading files. Nothing surfaces *"you are about to claim X under account Y, but
   X is owned by Z"* until you actually sign. The agent has no signal to act on
   before the irreversible step.

5. **No dev mode → no feedback loop to close.** An agent learns by running and
   observing. Here, the *only* way to test a deploy is an irreversible,
   phone-gated, funded mainnet-style transaction the agent cannot perform. So the
   loop is: edit blind → can't verify → hand to human → fails on phone → repeat.
   Misdiagnosis survives because nothing can falsify it locally.

**Net:** the flow is observable and testable for the *name* and unobservable and
untestable for the *thing that actually determines success* (the signer). That
asymmetry is the DevEx bug. A human hits it as "why does renaming keep failing";
an agent hits it as "I have no way to verify the fix I just made."

---

## 4. Is the moddable source missing this? — Yes

The published, moddable template ships **only** the live, phone-signed,
hardcoded-name path. Concretely, the moddable source is missing:

- **A dev/offline mode** with a dummy keypair, so a freshly-modded app runs and is
  verifiable with zero funding and zero ownership binding.
- **Unique-name derivation.** It ships a hardcoded `@org/leaderboard` instead of
  deriving an owned name from the authenticated account at deploy time.
- **An ownership preflight.** Nothing checks name↔signer ownership before signing.
- **Funding/allowance prompts.** No UI/CLI prompt when PAS / DOT / Bulletin
  allowance is missing; failures are raw chain errors.
- **A single source of truth for the package name.** It is duplicated across 4
  files with only a `grep` as the safety net.
- **Persisted deploy identity.** Nothing records which account owns what, so the
  next session (human or agent) starts blind.

Anyone who mods this template inherits every one of these gaps. The modding example
cannot be cleanly "showcased" until they're addressed.

---

## 5. Proposed upstream solution

Built around the dev-mode / live-mode model, with the funding prompt you described.
Two complementary halves: **(A) make a mod runnable instantly** and **(B) make the
real deploy safe.**

### A. Dev mode (default for a fresh mod) — closes the verification loop

- On `pg mod` / first `npm run dev`, generate a **local dummy keypair** (Alice-style
  dev account) automatically.
- The app runs **fully end-to-end against it** — register, play a round, write to a
  **local/dev leaderboard** — with **no real deploy, no funding, no phone, no
  ownership binding.**
- This is what lets a developer *or a coding agent* confirm "my mod works" before
  any irreversible step. It directly removes hiccups #9 and the whole
  misdiagnosis loop in §3 — the fix becomes falsifiable locally.

### B. Live mode (connected account) — makes the real deploy safe

- A clear toggle from dev mode to **live mode**: connect a real account (phone /
  suri). Dev mode is for building; live mode is for shipping.
- **Funding prompt in the UI/CLI.** On entering live mode (and again at deploy
  preflight), check balances. If PAS/DOT or Bulletin allowance is missing, **prompt
  the user with the exact amount and inline faucet links** instead of failing later
  with `InvalidTxError {"Payment"}` / `AccountUnmapped`. (Fixes #10.)
- **Auto-derive an owned package name at deploy time** from the signer (e.g.
  `@<account-handle>/leaderboard`) instead of shipping a hardcoded name. No 4-file
  rename, no inherited collision. (Fixes #1, #3, #5.)
- **Ownership preflight before signing:** *"You're about to claim
  `@X/leaderboard` under account `0x…`. Status: {free / owned by you / owned by
  someone else}."* If it's owned by someone else, lead with the **signer** fix,
  not the rename. (Fixes #1, #2, #7.)
- **`--signer dev` must require `--suri`** (or loudly warn). No silent shared
  mnemonic. (Fixes #8.)
- **One source of truth for the package name** + auto-regenerated ABI on contract
  change, with a build-time warning if `cdm.json`'s ABI drifts from the compiled
  contract. (Fixes #4, #5, #11.)
- **Persist deploy identity** (who signed, what was claimed) into a repo file so the
  next session — human or agent — can see ownership at a glance. (Fixes #7.)

### How this showcases the modding example properly

With A+B, the demo becomes: *mod the app → it runs instantly in dev mode against a
dummy key → flip to live mode → the UI prompts you to fund and confirms the name is
yours → one signed deploy → done.* The ownership trap is designed out instead of
documented around.

---

## 6. Priority for upstream

1. **Dev mode with a dummy keypair** (#9) — highest leverage; unblocks both humans
   and agents and makes everything else testable.
2. **Ownership preflight + signer-first error guidance** (#1, #2, #7) — kills the
   recurring collision and the misdiagnosis loop.
3. **Funding prompts in-app** (#10) — turns cryptic chain errors into actionable UI.
4. **Auto-derived owned name + single source of truth** (#3, #5) — removes the
   manual 4-file rename entirely.
5. **`--signer dev` requires `--suri`** (#8) — closes the shared-mnemonic footgun.
