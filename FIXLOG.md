# Deploy fix log — rock-paper-scissors-c75b69

Context: `pg deploy` failed with **"Signing Failed — No library specified and no
dependencies found in cdm.json"** and contracts wouldn't deploy to the playground.

## What was actually broken

### 1. `pg deploy` was running against the wrong directory
`playground deploy`'s `--dir` defaults to the **current working directory**. The
parent repo (`playground-dot`, the tip-jar app) has **no `Cargo.toml` and no
`cdm.json`**. When the contract pre-step runs there, the install routine hits
`installRequestsFromArgs()` with zero dependencies and throws:

> No library specified and no dependencies found in cdm.json.

That is the literal error you saw — it comes from the contract **install** step,
not a chain/signing problem (the "Signing Failed" banner is just the wrapper title).

**Fix:** run `pg deploy` from **inside** `rock-paper-scissors-c75b69/` (or pass
`--dir <path-to-rps>`). Verified: from the rps dir, `--dir` defaults correctly and
`cargo metadata` detects the `leaderboard` contract.

### 2. The contract package was renamed onto someone else's registry entry
The mod did **not** change the contract code — `contracts/leaderboard/lib.rs` is
byte-for-byte the original, and its interface matches the deployed ABI in
`cdm.json` exactly. The only contract change the mod made was the **package name**:

```
-package = "@rps/leaderboard"
+package = "@whiterabbit-rps/leaderboard"   # owned by 0x35cdb23f… (the upstream author)
```

`@whiterabbit-rps/leaderboard` is already registered and **owned by another
account**, so any deploy/own attempt fails the CDM ownership check:

> CDM package "@whiterabbit-rps/leaderboard" is already owned by 0x35cdb…,
> but the selected signer maps to 0x9621… Deploy with the owner account.

**Fix (deploy your own contract):** renamed the package to a name you'll own,
`@rps-c75b69/leaderboard` (tied to your unique domain so it won't collide), in all
three places that reference it:
- `contracts/leaderboard/Cargo.toml` → `[package.metadata.cdm] package`
- `src/utils.ts` → `libraries: [...]` and `getContract(...)` (+ comment)
- `cdm.json` → `dependencies` + `contracts` keys

The address/metadataCid in `cdm.json` are stale placeholders; they get rewritten
on first deploy, and the frontend resolves the address **live from the registry**
(`ContractManager.fromLiveClient`), so a redeploy is picked up without shipping a
new `cdm.json`.

## Verified working
- `cdm build` → `@rps-c75b69/leaderboard` compiles to a 25.5 KB PolkaVM blob ✓
- `npm run build:frontend` (tsc + vite) builds clean ✓
- No remaining `whiterabbit-rps` references in `src/`, `contracts/`, `cdm.json` ✓

## Remaining step (you must run — it's outward-facing and binds ownership)
Deploy with **your own** signer so **you** own `@rps-c75b69/leaderboard`. Do NOT
deploy with `//Alice` or a throwaway key — whoever signs first owns the package.

1. Log in once (phone QR):           `pg init`
2. Ensure your account has paseo-next-v2 test funds (deploy maps the account for you).
3. From this directory:              `pg deploy --contracts`
   - builds → deploys+registers your contract → updates `cdm.json` → rebuilds the
     frontend → uploads to Bulletin → registers the `.dot` domain → publishes.

To deploy the frontend only and reuse the existing live contract instead, you'd
revert the rename and run `pg deploy --no-contracts` — but then you don't own the
leaderboard. The rename above is the "own your contract" path you chose.
