# Live deploy run log

Issues hit during the actual `pg deploy` (real terminal, phone signer
`5CPPtNCa…ME6n4`, account `whiterabbit`/`0xcf8a…`, contract
`@rps-cf8a-c7e67f/leaderboard`). Newest first.

## Issue 4 — a BRAND-NEW random name is also "owned by 0x35cdb" → renaming is futile

**Symptom:** after re-pair, deploying `@rps-cf8a-c7e67f/leaderboard` (a freshly
generated 6-hex random name) fails with:
`already owned by 0x35cdb…, but the selected signer maps to 0xcf8a…`.

**Why this is decisive:** a random never-before-used name *cannot* have been
pre-registered. Yet it reports the **same** owner `0x35cdb` as the previous name
(`@whiterabbit-c75b69`). Two different random names → same owner. So this is **not
a naming collision** — renaming will never fix it. The registry returns `0x35cdb`
as the owner regardless of the name. `cdm` exposes no `getOwner`/`whoami`, so it
can't be probed before signing (PARITY-ISSUES.md P0).

**Interpretation:** ownership is bound to the **signer**, exactly as
DEVEX-REPORT.md §1–2/§7 concluded — the error's *second* clause ("or deploy with
the owner account") is the real lever, not the rename. `0x35cdb` is the account
that owns this app's contract lineage; the active signer maps to `0xcf8a` and
cannot claim names the registry attributes to `0x35cdb`.

**Note on the re-pair:** before `pg logout && pg init`, this same name proceeded
toward signing (Issue 3 stall) without an ownership error; after the re-pair it
errors on ownership. The re-pair may have discarded a session context that was
satisfying the check. (My suggestion to `pg logout` may have made this worse.)

**Open question (needs the user):** is `0x35cdb` an account you control — did you
deploy this app before, or is there a second account on your phone? That decides
the path.

## Issue 3 — deploy stalls at `▸ contracts deploy + install…`

**Symptom:** in a real terminal, the deploy prints the preflight summary then sits
on `▸ contracts deploy + install…` with no further output.

**Diagnosis (not a compile, not a crash):** `ps` showed the `pg deploy` process
alive but **idle** — ~3 s CPU over several minutes — and **no `cargo`/`rustc`
processes** running and no cargo lock contention. So it is not compiling the
contract; it is **waiting on the network at the first signature** (`Deploy and
register contracts`). In a TTY the wait renders as the spinner line instead of
the per-step output seen in non-TTY runs.

**Root cause:** the phone signing channel isn't delivering the request to the
device (same failure as Issue 1/2 — `createTransaction timed out — queue freed`),
so the deploy waits indefinitely at step 1.

**Fix:** re-pair the phone, then redeploy:
```sh
# Ctrl-C the stuck deploy
pg logout
pg init        # scan the fresh QR with the phone to re-establish signing
pg deploy --contracts --playground --moddable \
  --domain rock-paper-scissors-c75b69 --signer phone --buildDir dist
```
Keep the Polkadot mobile app foregrounded and approve each request promptly.

## Issue 2 — repeated `createTransaction timed out — queue freed`

Three backgrounded/agent-run attempts reached `approve on your phone (step 1)` and
then failed with `Mobile transaction signing rejected: createTransaction timed out
— queue freed`. Cause: signing pushed to the phone but not approved in the window
(app not open/foregrounded; agent-run = no TTY for the prompt to render). The
deploy must run in a real terminal with the phone open. See `DEPLOY-LOG.md`.

## Issue 1 — `already owned by 0x35cdb…`

`@whiterabbit-c75b69/leaderboard` was owned by `0x35cdb…` (the original `-c75b69`
deployer) while the signer maps to `0xcf8a…`. Fixed by renaming to a fresh
high-entropy name `@rps-cf8a-c7e67f/leaderboard` via `npm run name:new`
(see commit; the frontend derives the name from `cdm.json`). Upstreamed as the
collision-free-naming fix (paritytech/Rock-Paper-Scissors#11).
