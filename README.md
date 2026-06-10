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

