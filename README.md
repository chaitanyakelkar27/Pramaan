# Pramaan

Pramaan is a Sepolia-based provenance and trust platform for GI/craft products. It combines artisan identity verification, AI-assisted authenticity gating, on-chain product lifecycle tracking, dynamic royalties, and judge-ready monitoring/evidence tooling.

## Repository Structure

- `blockchain/`: Hardhat contracts, deployment scripts, env sync scripts, demo transaction generator.
- `frontend/`: Next.js App Router UI, API routes, web3 helpers, monitor/evidence/checklist pages.
- `docs/`: deployment runbook and demo evidence.

## What Is Implemented

## 1) Smart Contracts

### ArtisanRegistry (`blockchain/contracts/ArtisanRegistry.sol`)

Implemented:
- Soulbound artisan identity token (non-transferable ERC721).
- Artisan registration gate: `craftScore >= 60`.
- Identity/trust layer:
  - Aadhaar verification flag (`verifyAadhaar`, owner-controlled).
  - Validator role management (`addValidator`, owner-controlled).
  - Validator approval step (`approveArtisan`, validator-controlled).
  - Verification status enforcement (`isVerifiedArtisan`).
- Web-of-trust layer:
  - Artisan vouching (`vouchFor`) with reputation threshold.
  - Vouch counts (`getVouchedByCount`).
  - Slashing (`slash`) for fraudulent artisan pathways.
  - Reputation tracking for participants.
- One-wallet-one-artisan registration check.

### ProductRegistry (`blockchain/contracts/ProductRegistry.sol`)

Implemented:
- Product registration with required provenance fields:
  - `productHash`, `ipfsCid`, `metadataHash`, `provenanceSigner`, device signature, origin coordinates.
- Verified-artisan-only registration (`isVerifiedArtisan` gate).
- AI authenticity gate at registration (`terroirScore >= 70`).
- Product transfer tracking with handler chain and handler verification flags.
- Dynamic tapered royalties via `calculateRoyalty` and `_taperedRoyaltyBps`.
- Automatic royalty payout to the original artisan on transfer.
- Terroir computation based on custody quality and suspicious transfer patterns.
- Anti-clone scan nonce checkpointing and replay detection:
  - `checkpointScanNonce`
  - `isScanNonceUsed`

## 2) Frontend Application

Main implemented user flows:
- `/artisan`: wallet connect, trust badges, Aadhaar/validator actions, artisan registration, projected earnings panel.
- `/register-product`: image upload, hashing, AI verification call, on-chain registration, QR generation, certificate view.
- `/verify`: product lookup, trust status, handler chain timeline, terroir status, anti-replay nonce checkpoint.
- `/transfer`: ownership transfer, tapered royalty preview, projected terroir impact.

Operations/demo pages:
- `/monitor`: live Sepolia event timeline (`ProductRegistered` + `ProductTransferred`).
- `/checklist`: judge-demo navigation order.
- `/evidence`: local evidence collector with markdown export.

UI system implemented:
- Tailwind + shadcn-style component primitives.
- Responsive layout and modern app shell.
- Light/dark theming via `next-themes`.

## 3) AI Verification API

Implemented route:
- `frontend/app/api/verify-craft/route.js`

Behavior:
- Accepts uploaded image via multipart form data.
- Calls OpenAI Vision or Gemini Vision based on configured API keys.
- Enforces normalized JSON response shape: `terroir_score` + `reason`.
- Includes controlled fallback mode when no AI key is configured (demo continuity).

## 4) Web3 Integration Layer

Implemented in:
- `frontend/src/utils/abi.js`
- `frontend/src/utils/contract.js`

Includes:
- Updated ABI surfaces for trust + AI + royalty changes.
- Wallet connect and Sepolia enforcement.
- Artisan registration + product registration helpers.
- Transfer helper with royalty-aware value handling.
- Trust helper calls (`verifyAadhaar`, `approveArtisan`, `vouchFor`, reputation/vouch reads).
- Nonce checkpoint and replay checks.

## 5) Deployment and Demo Tooling

Implemented scripts (`blockchain/package.json`):
- `preflight:sepolia`
- `deploy:sepolia`
- `verify:sepolia`
- `sync:frontend:sepolia`
- `deploy:sepolia:sync`
- `deploy:sepolia:full`
- `demo:tx:sepolia`

Implemented artifacts:
- `blockchain/deployed.sepolia.json`
- `blockchain/demo-tx.sepolia.json`

Docs in place:
- `docs/deploy-ready.md`
- `docs/demo-evidence.md`

## Current Sepolia Deployment Snapshot

From repository artifacts:
- Network: Sepolia (`11155111`)
- ArtisanRegistry: `0xebbc94929cAa7ccFcDB92D879dF3305184ec3589`
- ProductRegistry: `0xe6f5eBb08532AD11A2b4Fb4dCa9aD4BDBffcF738`

## Local Setup

## 1) Blockchain

```bash
cd blockchain
npm install
cp .env.example .env
```

Set in `blockchain/.env`:
- `ALCHEMY_SEPOLIA_URL`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY` (optional, for verification)

Deploy and sync frontend env:

```bash
npm run deploy:sepolia:sync
```

Generate demo transactions:

```bash
npm run demo:tx:sepolia
```

## 2) Frontend

```bash
cd frontend
npm install
```

Create/update `frontend/.env.local`:
- `NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_WS_RPC_URL`
- `NEXT_PUBLIC_WEB3STORAGE_TOKEN`
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (recommended for real AI mode)
- `NEXT_PUBLIC_VERCEL_URL` (optional)

Run locally:

```bash
npm run dev
```

Build check:

```bash
npm run build
```

## Demo Story (Implemented End-to-End)

1. Onboard artisan and show trust badges (Aadhaar, validator, reputation).
2. Register product with AI authenticity gate + on-chain provenance fields.
3. Transfer ownership with automatic royalty settlement.
4. Verify product trust trail and demonstrate nonce anti-replay.
5. Show live monitor and export evidence packet.

## Current Limitations (Known, Explicit)

- Aadhaar verification is a mock on-chain flag, not a real external KYC integration.
- Onboarding is currently non-custodial browser-wallet based (not embedded auto-wallet creation).
- No server-side MPC/HSM key custody stack is implemented yet.
- Provenance signer/device signature values are stored, but full cryptographic attestation policy is still minimal.
- AI route supports a controlled fallback mode for demo when AI keys are absent.

## Notes

- Node.js 20/22 LTS is recommended for Hardhat stability.
- Frontend builds cleanly with Next.js production build.
