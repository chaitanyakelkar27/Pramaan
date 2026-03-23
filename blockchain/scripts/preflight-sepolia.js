const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function isPlaceholder(value) {
  const raw = String(value || "").toLowerCase();
  return !raw || raw.includes("your_key") || raw.includes("your_private_key");
}

function isValidHttpUrl(value) {
  return /^https:\/\//i.test(String(value || ""));
}

function sanitizeKey(value) {
  const trimmed = String(value || "").trim();
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

function isValidPrivateKey(value) {
  return /^[a-fA-F0-9]{64}$/.test(String(value || ""));
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(major) && major > 22) {
    console.warn("[warn] Hardhat may be unstable on Node > 22. Recommended: Node 20 or 22.");
  }
}

function main() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing blockchain/.env. Copy blockchain/.env.example and fill credentials.");
  }

  const rpc = process.env.ALCHEMY_SEPOLIA_URL;
  const privateKey = sanitizeKey(process.env.PRIVATE_KEY);

  if (isPlaceholder(rpc) || !isValidHttpUrl(rpc)) {
    throw new Error("ALCHEMY_SEPOLIA_URL is missing or invalid. Use a full https URL.");
  }

  if (isPlaceholder(privateKey) || !isValidPrivateKey(privateKey)) {
    throw new Error("PRIVATE_KEY is missing or invalid. Use 64 hex chars (with or without 0x).\n");
  }

  checkNodeVersion();
  console.log("[ok] Sepolia preflight passed.");
  console.log("[ok] RPC configured:", rpc.slice(0, 36) + "...");
  console.log("[ok] Private key format validated.");
  if (!process.env.ETHERSCAN_API_KEY) {
    console.log("[note] ETHERSCAN_API_KEY not set. Contract verification step may fail.");
  }
}

main();
