# Modding & deploying — the working steps

A start-to-finish runbook for changing this app and getting it live. Run commands
from the app directory:

```sh
cd "/Users/salansky/Desktop/👨‍💻👨‍💻DevProjects/playground-dot/rock-paper-scissors-c75b69"
```

---

## 0. Be the account that OWNS this app (one-time, the thing that blocked us)

The contract names for this app are owned by `0x35cdb…` — your **original** deploy
account, a different key from the `whiterabbit`/`0xcf8a…` your phone defaults to.
The deploy must **sign as the owner**, or it fails with `already owned by 0x35cdb…`.

```sh
pg logout
pg init      # on the phone, pick the account you FIRST deployed this app with (= 0x35cdb)
```

Verify you're on the right account: the `pg deploy` preflight `Signer` line / the
ownership check should reflect `0x35cdb`, not `0xcf8a`. (For a brand-new app you
own from scratch, skip this — just stay on one account and run `npm run name:new`.)

---

## 1. Mod the code

Edit the frontend (`src/…`) and/or the contract (`contracts/leaderboard/lib.rs`).
Frontend-only changes are the fast path (no contract redeploy needed later).

## 2. Verify offline — before any deploy

```sh
npm run dev
# open http://localhost:3000/?mock  → exercise your change end-to-end
# (register / play / leaderboard, no chain, no phone, no funding)
```
Only move on once the mod works here. This is the cheap, reversible check.

## 3. Save your work (git)

```sh
git add -A
git commit -m "mod: <what you changed>"
git push
```

## 4. Build

```sh
pg build
```

## 5. Deploy

Phone unlocked, **Polkadot app open and foregrounded**, signed in as the owner
account (step 0). Then:

```sh
pg deploy --contracts --playground --moddable \
  --domain rock-paper-scissors-c75b69 --signer phone --buildDir dist
```

Approve each request on the phone (~4–5: contract deploy → reserve domain →
finalize → link content → publish). On success it prints your live
`https://rock-paper-scissors-c75b69.dot.li` URL + contract address + CIDs.

> **Frontend-only re-deploys** (after the contract is live, no `contracts/` change):
> drop `--contracts` (or add `--no-contracts`) for fewer phone approvals.

## 6. Verify live

```sh
open "https://rock-paper-scissors-c75b69.dot.li"
```

---

## If a step fails

| Symptom | Cause | Fix |
|---|---|---|
| `already owned by 0x35cdb… signer maps to 0xcf8a…` | signing as the wrong account | redo step 0 — re-pair to the **owner** account; renaming does NOT help |
| Hangs at `▸ contracts deploy + install…` / `createTransaction timed out` | phone app not open/foregrounded | reopen the Polkadot app, re-run; **don't `pg logout`** (it can switch your account) |
| `Raw mode is not supported…` | `--buildDir` missing | keep `--buildDir dist` in the command |
| `No library specified…` | wrong directory | run from the app dir (top of this file) |
| `InvalidTxError {"Payment"}` / `AccountUnmapped` | missing funds/allowance | `pg init` (funds + allowances), top up via the faucets in README |

Full diagnostics: [DEPLOY-RUN-LOG.md](./DEPLOY-RUN-LOG.md) ·
why it should be smoother: [MODDER-PROMPTS.md](./MODDER-PROMPTS.md)
