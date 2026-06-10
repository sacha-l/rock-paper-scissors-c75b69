# RPS Game

> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

Decentralized rock-paper-scissors game, with on-chain leaderboard and game history.

## Modes

- **Solo** — play against the computer, best-of-3
- **Multiplayer** — play against another player via Statement Store (commit-reveal anti-cheat)

Scoring: win **+2**, loss **−1**, draw **0**.

## How it works

**Solo:** You play locally → after the match, JSON with history is uploaded to Bulletin → contract stores CID + points.

**Multiplayer:** Create a room, get a code, share it with your opponent. Each round:
1. Both players send `commit = SHA256(move + salt)` over Statement Store
2. Once both commits arrive, they send `reveal = { move, salt }`
3. Hash is verified, round winner is determined

**Leaderboard:** Contract on Asset Hub stores a `address → (CID, points)` mapping. All games live on Bulletin (off-chain, content-addressed).

## Running

```bash
npm install
npm run dev
```

Then choose how to run it:

- **Offline dev mode (no host, no chain) — `http://localhost:3000/?mock`.**
  Runs the whole app against an in-memory leaderboard: register, Solo play,
  profile and leaderboard all work in a plain browser with no Polkadot host,
  no deploy, no phone, no funding. Use this to build and verify a mod.
- **Against the live chain — open `http://localhost:3000` in Polkadot Desktop.**
  Real account, real Asset Hub contract, real Bulletin uploads. Multiplayer
  requires this (it needs the Host API container).
  > Account needs PAS on Asset Hub ([faucet](https://faucet.polkadot.io/)) and Bulletin ([faucet](https://paritytech.github.io/polkadot-bulletin-chain/authorizations?tab=faucet)).

## Modding & deploying — the recommended path

The deploy step binds contract ownership to your signer and is irreversible, so
**verify every change in offline dev mode before you deploy.** That order is the
whole point: don't burn a phone-signed, funded on-chain deploy to find out a mod
is broken.

**0. Claim a unique contract name first (one command):**

```bash
npm run name:new
```

This is the single most important step for a smooth deploy. The template ships a
hardcoded contract package name, and on a public registry that name is usually
**already owned by another signer** — so `pg deploy` fails with
`already owned by 0x…` (the recurring trap; see `DEVEX-REPORT.md` #1). `npm run
name:new` generates a fresh high-entropy name (`@rps-<8hex>/leaderboard`) that
nobody owns and rewrites it everywhere it's needed (`cdm.json` +
`contracts/leaderboard/Cargo.toml`; the frontend derives it automatically). Run
it once when you start a mod and the ownership collision simply can't happen.
Pass your own name if you prefer: `npm run name:new @me/scoreboard`.

**1. Mod and verify locally (fast, no chain):**

```bash
npm run dev
# open http://localhost:3000/?mock and exercise your change end-to-end
```

**2. Build, then deploy from a real terminal.** Phone signing renders a QR per
transaction, so the deploy **must** run in your own terminal (a real TTY) with
your phone — it cannot be backgrounded or driven by an agent. Run it **from this
app directory**, and always pass `--buildDir dist`:

```bash
pg build
# FIRST deploy (contract not yet on-chain) — include --contracts:
pg deploy --contracts --playground --moddable \
  --domain <your-domain> --signer phone --buildDir dist
```

Approve the ~4 prompts on your phone (reserve domain → finalize → link content →
publish). On success it prints your live `https://<domain>.dot.li` URL.

**3. Iterating on frontend-only changes — skip the contract:** once the contract
is live, later mods that don't touch `contracts/` can drop `--contracts` (or pass
`--no-contracts`) for fewer signatures and no ownership step:

```bash
pg build
pg deploy --playground --moddable \
  --domain <your-domain> --signer phone --buildDir dist
```

**Naming:** the contract package name is read from `cdm.json` (single source of
truth). It must be a name **owned by, or free for, your signing account** — a
collision surfaces only at deploy as `already owned by 0x…`; if so, pick a new
`@<you>/leaderboard` in `cdm.json` (and `contracts/leaderboard/Cargo.toml`),
rebuild, and redeploy.

> Known tooling gaps in this flow (non-interactive deploy, ownership preflight,
> session-key signing) are tracked in [PARITY-ISSUES.md](./PARITY-ISSUES.md).
> Full step-by-step for a first deploy: [DEPLOYMENT.md](./DEPLOYMENT.md).

## Troubleshooting — deploy & mod errors

Every error below was actually hit while modding/deploying this app. Format: **what you see → why → fix.**

### Signing / phone

- **`Mobile transaction signing rejected: createTransaction timed out — queue freed`** (deploy stops at "approve on your phone")
  → The signing request was pushed to your phone but nothing approved it in time. Almost always: the **Polkadot mobile app isn't open and connected**.
  → Fix: open the Polkadot mobile app, confirm it's signed in as your account, **foreground it on the signing-requests screen**, then re-run the deploy and approve each request promptly (the window is short, ~30–60 s each). Expect ~4–5 approvals (contract deploy + reserve/finalize/link/publish).

- **`Raw mode is not supported on the current process.stdin`** (deploy exits immediately)
  → A prompt tried to open an interactive picker on a non-TTY stdin (e.g. omitting `--buildDir`).
  → Fix: always pass **`--buildDir dist`**. Run the deploy in a real terminal.

- **`--signer dev` "works" but a stranger owns your contract**
  → `--signer dev` with no `--suri` falls back to a **shared, publicly-known mnemonic**.
  → Fix: use **`--signer phone`** (recommended), or `--signer dev --suri <your-own-secret>` for CI only.

### Naming / ownership

- **`Contract "@you/leaderboard" already owned by 0x…, selected signer maps to 0x…`** (deploy register fails)
  → This is a **signer/ownership** problem, not just a naming one. Ownership is bound to the account that first deployed the name — renaming under the *same wrong signer* just collides again under a new name.
  → Fix: deploy under the account that owns the name, **or** pick a name that's free for / owned by **your** signer. Change it in **`cdm.json`** and **`contracts/leaderboard/Cargo.toml`**, then `pg build` and redeploy. You can't verify claimability before signing (see [PARITY-ISSUES.md](./PARITY-ISSUES.md) — registry has no `getOwner`).

- **App loads but the leaderboard/profile is empty against the live chain; console shows a resolve error**
  → The package name got out of sync between files (`cdm.json` vs `Cargo.toml`). The frontend reads the name from `cdm.json` now (single source of truth), but the Rust copy in `Cargo.toml` must match.
  → Fix: make `contracts/leaderboard/Cargo.toml`'s `package` match `cdm.json`'s contract key, rebuild, redeploy.

### Wrong directory / build

- **`No library specified and no dependencies found in cdm.json`** (looks like a "signing failed" banner)
  → You ran `pg deploy` from the monorepo parent, not the app folder.
  → Fix: run it **from this app directory**, or pass `--dir <app-path>`.

- **Contract changed but behavior is stale / ABI mismatch**
  → `cdm.json` shipped an older ABI than the compiled contract.
  → Fix: `pg deploy --contracts` rebuilds and **regenerates the ABI** in `cdm.json`. (The placeholder `address`/`metadataCid` in a fresh `cdm.json` are also rewritten on deploy — ignore them until then.)

### Funding

- **`InvalidTxError {"Payment"}`, `AccountUnmapped`, or `Revive::AccountUnmapped`**
  → Missing PAS/Bulletin allowance, or the account isn't mapped on pallet-revive yet.
  → Fix: run `pg init` (grants allowances + funds), and top up via the [Asset Hub faucet](https://faucet.polkadot.io/) / [Bulletin faucet](https://paritytech.github.io/polkadot-bulletin-chain/authorizations?tab=faucet). The app maps a fresh account automatically on its first contract call (one extra signature).

### Running / verifying

- **Plain browser shows the UI but no data, or contract calls fail**
  → Live mode needs the Polkadot host (Asset Hub follow + Host API). A bare browser tab can't open it.
  → Fix: either open in **Polkadot Desktop** (`http://localhost:3000`) for the live chain, or use **offline dev mode** (`http://localhost:3000/?mock`) to exercise register / Solo / leaderboard with no chain.

- **Multiplayer doesn't work in `?mock` dev mode**
  → Multiplayer needs the Statement Store / Host API container; dev mode only stubs the leaderboard contract.
  → Fix: test multiplayer in Polkadot Desktop. Use dev mode for Solo + leaderboard + profile.

> Deeper, tooling-level gaps (non-interactive deploy, ownership preflight, `pg whoami`)
> are out of this repo's control — tracked in [PARITY-ISSUES.md](./PARITY-ISSUES.md).

## Security

This is a reference proof-of-concept, **not a hardened production build**. Before
deploying it for any real use case, you are responsible for:

- Reviewing the code yourself.
- Checking that dependencies are up to date and free of known vulnerabilities.
- Securing your own fork or deployment environment (keys, secrets, network configuration).
- Tracking the latest tagged release / commits for security fixes — older releases
  are not backported (exceptions might apply).

For Parity's security disclosure process and Bug Bounty program, see
[parity.io/bug-bounty](https://parity.io/bug-bounty).

## License

Licensed under the [GNU General Public License v3.0 or later](./LICENSE) (GPL-3.0-or-later).

