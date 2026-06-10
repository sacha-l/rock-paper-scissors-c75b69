# What to prompt a modder with

The hard part of modding a Playground app isn't the code — it's a handful of
invisible, irreversible facts (who you're signed in as, whether your name is
claimable, whether your mod even runs) that today only surface *after* a
phone-signed, funded, ownership-binding deploy. Every item below is a prompt the
tooling (or template) should surface **at the moment it matters**, each tied to a
real failure from a live mod+deploy session. Ordered by when it should fire.

---

## At `pg mod` / first setup

**1. "You're signed in as `<handle>` (`0x…`). Is this the account you want to OWN this app?"**
Show the resolved signer address up front. Contract names and the domain you
deploy are bound to **this** account. This is the single biggest trap: the signer
is invisible everywhere (never written to the repo), so people don't know who they
are until a deploy fails.
*Prevents:* the whole "why does my deploy say already owned" misdiagnosis.

**2. "Claiming a fresh contract name → `@<auto>/leaderboard`."**
Auto-derive a unique, unowned package name from the account (or high entropy) and
write it everywhere it's needed — don't ship a hardcoded, guessable name.
*Prevents:* `CDM package "@…" is already owned by 0x…` on the first deploy.
*(Implemented here as `npm run name:new`.)*

---

## While building the mod

**3. "Run it offline first: `http://localhost:3000/?mock`."**
A dev mode that runs the whole app — register, play, leaderboard — with no chain,
phone, funding, or deploy. So a modder (or coding agent) can confirm the mod works
*before* the irreversible step. Make this the default for a fresh mod.
*Prevents:* "the only way to test is to deploy," and the blind edit→deploy→fail loop.
*(Implemented here as `?mock`.)*

---

## Right before deploy (preflight)

**4. Ownership preflight: "You're about to claim `@X/leaderboard` under `0x<signer>`. Status: { free · owned by YOU · owned by SOMEONE ELSE (`0x…`) }."**
If it's owned by someone else, **lead with the signer fix, not a rename.** Renaming
does NOT help when the registry attributes the name to another account — we proved
this by renaming to a random 6-hex name and getting the *same* owner back.
*Prevents:* renaming in circles; burning phone approvals to discover ownership.
*Needs upstream:* a registry `getOwner(name)` — none exists today (you can't verify
before signing). See [PARITY-ISSUES.md](./PARITY-ISSUES.md).

**5. Identity reconciliation: "The owner `0x35cdb…` is a DIFFERENT key than your
current signer `0xcf8a…`, even though both show as `whiterabbit`."**
Display name (Playground username) and the on-chain owner key are separate
namespaces, and session keys can churn between sessions — so the *same handle* can
map to different keys, and only one of them owns your names. If you deployed this
app before, **sign with the same account you used then.**
*Prevents:* the most confusing failure of all — being "yourself" but not the owner.

**6. Funding/allowance: "This deploy needs PAS on Asset Hub and a Bulletin
allowance. You have X / you're missing Y — fund here: <faucet links>."**
Check balances at preflight and prompt with the exact gap + inline faucets.
*Prevents:* cryptic `InvalidTxError {"Payment"}` / `AccountUnmapped` chain errors.

---

## During signing

**7. "Open the Polkadot app and keep it foregrounded — `N` approvals are coming."**
Signing is a per-transaction push to the phone with a short timeout. If the app
isn't open and polling, requests silently time out (`createTransaction timed out —
queue freed`) and the deploy hangs at step 1.
*Prevents:* the deploy stalling forever with no visible reason.

**8. "Don't `pg logout` to fix a hang."**
Logging out can discard the session context that owns your names and re-pair you as
a different key — turning a signing hang into an ownership failure.
*Prevents:* making a recoverable hang into a (harder) ownership mismatch.

---

## The one-line summary the tooling should embody

> **Tell the modder who they are, give them a name nobody owns, let them verify
> offline, and confirm ownership + funding before a single signature.**

Today none of these are prompted, so every one is discovered the hard way — after
an irreversible deploy. Surfacing them turns modding from a trap-hunt into:
*name:new → verify at `?mock` → deploy once.*
