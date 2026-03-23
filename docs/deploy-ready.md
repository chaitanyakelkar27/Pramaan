# Pramaan Deploy Runbook

## 1) Prerequisites
- Node.js 20.x or 22.x recommended (Hardhat warns on newer versions).
- Filled secrets in blockchain/.env:
  - ALCHEMY_SEPOLIA_URL
  - PRIVATE_KEY
  - ETHERSCAN_API_KEY (recommended)

## 2) One-command deployment
From blockchain/ run:

```bash
npm run deploy:sepolia:full
```

What this does:
- Validates Sepolia secrets (`preflight:sepolia`).
- Deploys ArtisanRegistry and ProductRegistry to Sepolia.
- Writes deployment artifacts:
  - blockchain/deployed.json
  - blockchain/deployed.sepolia.json
- Syncs frontend addresses/env values into frontend/.env.local.
- Verifies contracts on Etherscan (if ETHERSCAN_API_KEY is configured).

If you only want deploy + frontend env sync, run:

```bash
npm run deploy:sepolia:sync
```

## 3) Frontend launch
From frontend/ run:

```bash
npm run build
npm run start
```

## 4) Post-deploy evidence updates
- Copy contract addresses and deploy tx links from blockchain/deployed.sepolia.json.
- Update docs/demo-evidence.md transaction sections during demo execution.
- Capture screenshots from:
  - /artisan
  - /register-product
  - /transfer
  - /verify
  - /monitor
  - /evidence
