"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import TerritorScore from "../../components/TerritorScore";
import {
  approveEscrowForToken,
  confirmEscrowReceived,
  createEscrowSale,
  findLatestMintedTokenIdByRecipient,
  getConnectedAddress,
  getArtisan,
  getEscrowDetails,
  getProductNftOwner,
  markEscrowShipped,
  mintProductTwin,
  transferProduct,
  verifyProduct
} from "../../src/utils/contract";
import { RPC_URL } from "../../src/utils/constants";
import { appendEvidenceEntry } from "../../src/utils/evidence";
import { getIPFSUrl } from "../../src/utils/ipfs";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL)
});

const DEMO_BUYER_ADDRESS = "0x71C0000000000000000000000000000000000000";
const ESCROW_ONLY_MODE = true;

function getShareBaseUrl() {
  const configured =
    String(process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
    String(process.env.NEXT_PUBLIC_VERCEL_URL || "").trim();

  if (configured) {
    const normalized = configured.replace(/\/$/, "");
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    return "https://" + normalized;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export default function TransferPage() {
  const [hash, setHash] = useState("");
  const [recordState, setRecordState] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepProgress, setStepProgress] = useState("");

  const [newOwnerInput, setNewOwnerInput] = useState(DEMO_BUYER_ADDRESS);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [ensInfo, setEnsInfo] = useState("");
  const [newOwnerVerified, setNewOwnerVerified] = useState(null);

  const [paymentEth, setPaymentEth] = useState("");
  const [transferSuccess, setTransferSuccess] = useState(null);

  const [escrowTokenId, setEscrowTokenId] = useState("1");
  const [escrowSeller, setEscrowSeller] = useState("");
  const [escrowAmountEth, setEscrowAmountEth] = useState("");
  const [escrowId, setEscrowId] = useState("");
  const [escrowLoading, setEscrowLoading] = useState(false);
  const [escrowStatusText, setEscrowStatusText] = useState("");
  const [escrowData, setEscrowData] = useState(null);
  const [escrowStep, setEscrowStep] = useState(1);
  const [nftOwnerLive, setNftOwnerLive] = useState("");
  const [tokenLookupLoading, setTokenLookupLoading] = useState(false);
  const [mintingFromProduct, setMintingFromProduct] = useState(false);
  const [escrowLookupId, setEscrowLookupId] = useState("");
  const [connectedWallet, setConnectedWallet] = useState("");
  const [buyerShareLink, setBuyerShareLink] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hashFromUrl = params.get("hash") || "";
    const tokenIdFromUrl = params.get("tokenId") || "";
    const escrowIdFromUrl = params.get("escrowId") || "";

    if (tokenIdFromUrl && /^\d+$/.test(tokenIdFromUrl) && Number(tokenIdFromUrl) > 0) {
      setEscrowTokenId(tokenIdFromUrl);
    }

    if (escrowIdFromUrl && /^\d+$/.test(escrowIdFromUrl) && Number(escrowIdFromUrl) > 0) {
      setEscrowLookupId(escrowIdFromUrl);
      loadEscrow(escrowIdFromUrl);
    }

    if (!hashFromUrl) {
      return;
    }

    setHash(hashFromUrl);
    loadProduct(hashFromUrl);
  }, []);

  useEffect(() => {
    if (newOwnerInput) {
      resolveOwnerInput(newOwnerInput);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initWalletAndEscrowLookup() {
      try {
        const address = await getConnectedAddress();
        if (mounted) {
          setConnectedWallet(address);
        }
      } catch (_error) {
        // Ignore initial wallet fetch errors.
      }

      if (typeof window !== "undefined") {
        const lastEscrowId = window.localStorage.getItem("pramaan:lastEscrowId") || "";
        if (lastEscrowId && /^\d+$/.test(lastEscrowId) && mounted) {
          setEscrowLookupId(lastEscrowId);
        }
      }
    }

    initWalletAndEscrowLookup();

    if (typeof window !== "undefined" && window.ethereum?.on) {
      const onAccountsChanged = (accounts) => {
        const next = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : "";
        setConnectedWallet(next);
      };

      window.ethereum.on("accountsChanged", onAccountsChanged);

      return () => {
        mounted = false;
        try {
          window.ethereum.removeListener("accountsChanged", onAccountsChanged);
        } catch (_error) {
          // Ignore listener cleanup errors.
        }
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (escrowId) {
      setEscrowLookupId(String(escrowId));
    }
  }, [escrowId]);

  useEffect(() => {
    let cancelled = false;

    async function syncNftOwnerFromToken() {
      if (!escrowTokenId || !/^\d+$/.test(String(escrowTokenId)) || Number(escrowTokenId) <= 0) {
        return;
      }

      try {
        const owner = await getProductNftOwner(Number(escrowTokenId));
        if (!cancelled) {
          setNftOwnerLive(owner);
        }
      } catch (_error) {
        if (!cancelled) {
          setNftOwnerLive("");
        }
      }
    }

    syncNftOwnerFromToken();

    return () => {
      cancelled = true;
    };
  }, [escrowTokenId]);

  function truncateAddress(address) {
    if (!address) {
      return "-";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  function getCurrentOwner(record) {
    const handlers = record?.handlers || [];
    if (handlers.length === 0) {
      return record?.artisan || "";
    }
    return handlers[handlers.length - 1];
  }

  function calculateRoyaltyPercent(transferNumber) {
    const n = Math.max(1, Number(transferNumber || 1));
    return 40 / Math.sqrt(n);
  }

  function calculateProjectedTerroir(record, nextOwnerIsVerified) {
    if (!record) {
      return 0;
    }

    let score = 100;
    const existingUnverified = (record.handlerVerified || []).filter((value) => !value).length;
    score -= existingUnverified * 15;

    if (!nextOwnerIsVerified) {
      score -= 15;
    }

    const newTransferCount = Number(record.transferCount || 0) + 1;

    if (newTransferCount > 10) {
      score -= 10;
    }

    const now = Math.floor(Date.now() / 1000);
    const registeredAt = Number(record.registeredAt || 0);
    if (registeredAt > 0 && now < registeredAt + 86400 && newTransferCount > 3) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  async function loadProduct(inputHash) {
    const clean = String(inputHash || "").trim();
    if (!clean) {
      setStatus("Enter a product hash.");
      return;
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(clean)) {
      setStatus("Invalid product hash format. Expected 0x + 64 hex chars.");
      return;
    }

    setLoading(true);
    setStatus("Loading product from Sepolia...");
    setTransferSuccess(null);

    try {
      let data = null;
      let lastError = null;
      const maxAttempts = 4;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          data = await verifyProduct(clean);
          break;
        } catch (error) {
          lastError = error;
          const message = String(error?.shortMessage || error?.message || "").toLowerCase();
          const isNotFound = message.includes("product not found");
          if (!isNotFound || attempt === maxAttempts) {
            throw error;
          }

          setStatus(
            "Product not visible yet on RPC (attempt " +
            attempt +
            "/" +
            maxAttempts +
            "). Retrying..."
          );
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      if (!data) {
        throw lastError || new Error("Could not load product.");
      }

      setRecordState(data);
      const ownerCandidate = getCurrentOwner(data?.record);
      if (ownerCandidate) {
        try {
          const latestTokenId = await findLatestMintedTokenIdByRecipient(ownerCandidate);
          if (latestTokenId > 0) {
            setEscrowTokenId(String(latestTokenId));
          }
        } catch (_tokenLookupError) {
          // Keep manual/tokenId-from-url value if lookup fails.
        }
      }
      setStatus("Product loaded.");
    } catch (error) {
      const normalizedHash = clean.toLowerCase();
      let usedSnapshot = false;
      if (typeof window !== "undefined") {
        try {
          const rawSnapshot = window.sessionStorage.getItem("pramaan:lastRegisteredProduct");
          if (rawSnapshot) {
            const snapshot = JSON.parse(rawSnapshot);
            const snapshotHash = String(snapshot?.hash || "").toLowerCase();
            if (snapshotHash === normalizedHash && snapshot?.record) {
              setRecordState({ record: snapshot.record, terroir: Number(snapshot?.terroir || 100) });
              if (snapshot?.mintedTokenId && /^\d+$/.test(String(snapshot.mintedTokenId))) {
                setEscrowTokenId(String(snapshot.mintedTokenId));
              }
              setStatus("Loaded recently registered product snapshot. On-chain verify is still syncing.");
              usedSnapshot = true;
            }
          }
        } catch (_snapshotError) {
          // Ignore snapshot parse/read issues.
        }
      }

      if (usedSnapshot) {
        return;
      }

      setRecordState(null);
      const message = String(error?.shortMessage || error?.message || "");
      if (message.toLowerCase().includes("product not found")) {
        setStatus("Product not found on current ProductRegistry deployment. If just registered, wait a few seconds and retry.");
      } else {
        setStatus(message || "Could not load product.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function resolveOwnerInput(value) {
    const text = String(value || "").trim();
    setEnsInfo("");
    setResolvedAddress("");
    setNewOwnerVerified(null);

    if (!text) {
      return;
    }

    let candidate = text;

    if (text.includes(".") && !text.startsWith("0x")) {
      try {
        const ensAddress = await publicClient.getEnsAddress({ name: text });
        if (ensAddress) {
          candidate = ensAddress;
          setEnsInfo("ENS resolved to " + ensAddress);
        } else {
          setEnsInfo("ENS name could not be resolved on this network.");
          return;
        }
      } catch (_error) {
        setEnsInfo("ENS resolution failed on this network.");
        return;
      }
    }

    if (!candidate.startsWith("0x") || candidate.length !== 42) {
      setEnsInfo("Invalid wallet address format.");
      return;
    }

    setResolvedAddress(candidate);

    try {
      const artisan = await getArtisan(candidate);
      setNewOwnerVerified(
        Boolean(artisan?.isAadhaarVerified) && !Boolean(artisan?.isFraudulent) && Number(artisan?.registeredAt || 0) > 0
      );
    } catch (_error) {
      setNewOwnerVerified(false);
    }
  }

  async function onConfirmTransfer(event) {
    event.preventDefault();

    if (!hash || !recordState?.record) {
      setStatus("Load a valid product hash first.");
      return;
    }

    const targetAddress = resolvedAddress || newOwnerInput.trim();
    if (!targetAddress || !targetAddress.startsWith("0x") || targetAddress.length !== 42) {
      setStatus("Please provide a valid new owner wallet address or resolvable ENS.");
      return;
    }

    const ownerAddress = String(currentOwner || "").toLowerCase();
    if (ownerAddress && targetAddress.toLowerCase() === ownerAddress) {
      setStatus("New owner cannot be the same as current owner.");
      return;
    }

    setLoading(true);
    setTransferSuccess(null);
    setStepProgress("Step 1/2: Transferring ownership...");

    try {
      const connectedAddress = (await getConnectedAddress()).toLowerCase();
      if (ownerAddress && connectedAddress !== ownerAddress) {
        setStatus("Switch wallet to current owner " + truncateAddress(currentOwner) + " to confirm transfer.");
        return;
      }

      const transferNumber = Number(recordState.record.transferCount || 0) + 1;
      const royaltyPercent = calculateRoyaltyPercent(transferNumber);
      const buyerPayment = Number(paymentEth || 0);
      const artisanPayment = (buyerPayment * royaltyPercent) / 100;

      const receipt = await transferProduct(hash.trim(), targetAddress, paymentEth);

      setStepProgress("Step 2/2: Artisan royalty payment sent automatically...");

      const refreshed = await verifyProduct(hash.trim());
      setRecordState(refreshed);

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      if (txHash) {
        appendEvidenceEntry({
          action: "Transfer",
          productHash: hash.trim(),
          txUrl: "https://sepolia.etherscan.io/tx/" + txHash,
          notes: "Transferred to " + targetAddress
        });
      }
      setTransferSuccess({
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        newTerroir: refreshed.terroir,
        artisanPaymentEth: artisanPayment.toFixed(6),
        retailerQrUrl: "/retailer-verify?productHash=" + encodeURIComponent(hash.trim())
      });
      setStatus("Transfer completed successfully.");
    } catch (error) {
      const raw = extractReadableError(error, "Transfer failed.");
      const lower = raw.toLowerCase();

      if (lower.includes("caller is not current owner")) {
        setStatus("Transfer failed: connect the current owner wallet shown above.");
      } else if (lower.includes("insufficient funds") || lower.includes("intrinsic gas") || lower.includes("gas required exceeds")) {
        setStatus("Transfer failed: wallet needs more Sepolia ETH for gas and payment value.");
      } else if (lower.includes("invalid new owner")) {
        setStatus("Transfer failed: new owner wallet address is invalid.");
      } else if (lower.includes("product not found")) {
        setStatus("Transfer failed: product hash not found on Sepolia.");
      } else {
        setStatus(raw || "Transfer failed.");
      }
    } finally {
      setLoading(false);
      setStepProgress("");
    }
  }

  function getEscrowStatusLabel(status) {
    const labels = {
      0: "None",
      1: "Created",
      2: "Shipped",
      3: "Completed",
      4: "Refunded",
      5: "Disputed",
      6: "Resolved"
    };
    return labels[Number(status)] || "Unknown";
  }

  function extractReadableError(error, fallbackMessage) {
    const queue = [error];
    const seen = new Set();
    const candidates = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current)) {
        continue;
      }
      seen.add(current);

      const fields = [
        current.shortMessage,
        current.details,
        current.message,
        current.reason,
        current?.data?.message,
        current?.error?.message
      ].filter(Boolean);

      for (const field of fields) {
        const text = String(field).trim();
        if (text) {
          candidates.push(text);
        }
      }

      if (current.cause) {
        queue.push(current.cause);
      }
      if (current.error && typeof current.error === "object") {
        queue.push(current.error);
      }
      if (current.data && typeof current.data === "object") {
        queue.push(current.data);
      }
    }

    for (const candidate of candidates) {
      const revertMatch = candidate.match(/execution reverted:?[\s\"]*([^\n\"]+)/i);
      if (revertMatch?.[1]) {
        return revertMatch[1].trim();
      }
      if (!candidate.toLowerCase().includes("execution reverted")) {
        return candidate;
      }
    }

    return fallbackMessage;
  }

  function mapEscrowError(raw, fallbackMessage) {
    const lower = String(raw || "").toLowerCase();

    if (lower.includes("erc721: invalid token id") || lower.includes("invalid token id")) {
      return "Escrow failed: this NFT Token ID is not minted on Sepolia. Use a valid minted token ID.";
    }
    if (lower.includes("buyer and seller cannot match")) {
      return "Escrow failed: buyer and seller cannot be same wallet. Switch account and try again.";
    }
    if (lower.includes("only buyer can confirm")) {
      return "Confirm failed: switch to the buyer wallet used to create escrow.";
    }
    if (lower.includes("not ready for confirmation")) {
      return "Confirm failed: seller must mark shipped before buyer can confirm.";
    }
    if (lower.includes("confirmation window expired")) {
      return "Confirm failed: confirmation window has expired. Raise dispute or create a new escrow.";
    }
    if (lower.includes("escrow contract not approved for token")) {
      return "Confirm failed: seller must approve NFT to escrow contract and mark shipped again.";
    }
    if (lower.includes("approve caller is not token owner") || lower.includes("not token owner or approved for all")) {
      return "Mark shipped failed: connect the seller wallet that owns this NFT token, then try again.";
    }
    if (lower.includes("seller no longer owner")) {
      return "Confirm failed: seller no longer owns this NFT token.";
    }
    if (lower.includes("user rejected") || lower.includes("rejected the request") || lower.includes("action_rejected")) {
      return "Transaction rejected in wallet.";
    }

    return raw || fallbackMessage;
  }

  async function loadEscrow(idValue) {
    const id = Number(idValue);
    if (!Number.isFinite(id) || id <= 0) {
      setEscrowStatusText("Provide a valid escrow ID.");
      return;
    }

    setEscrowLoading(true);
    try {
      const details = await getEscrowDetails(id);
      setEscrowId(String(id));
      setEscrowData(details);
      try {
        const liveOwner = await getProductNftOwner(details.tokenId);
        setNftOwnerLive(liveOwner);
      } catch (_ownerError) {
        setNftOwnerLive("");
      }
      const statusNum = Number(details?.status || 0);
      if (statusNum <= 0) {
        setEscrowStep(1);
      } else if (statusNum === 1) {
        setEscrowStep(2);
      } else if (statusNum === 2) {
        setEscrowStep(3);
      } else {
        setEscrowStep(4);
      }
      setEscrowStatusText("Escrow details loaded.");

      if (typeof window !== "undefined") {
        window.localStorage.setItem("pramaan:lastEscrowId", String(id));
      }
    } catch (error) {
      setEscrowData(null);
      setNftOwnerLive("");
      setEscrowStatusText(error?.shortMessage || error?.message || "Could not load escrow details.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onCreateEscrow(event) {
    event.preventDefault();

    if (!escrowTokenId) {
      setEscrowStatusText("Token ID is required.");
      return;
    }

    let derivedSeller = currentOwner || escrowSeller;
    if (!derivedSeller || !String(derivedSeller).startsWith("0x") || String(derivedSeller).length !== 42) {
      setEscrowStatusText("Load product first so seller wallet can be derived automatically.");
      return;
    }

    if (!escrowAmountEth) {
      setEscrowStatusText("Please enter escrow amount.");
      return;
    }

    try {
      const ownerOnNft = await getProductNftOwner(Number(escrowTokenId));
      if (String(ownerOnNft).toLowerCase() !== String(derivedSeller).toLowerCase()) {
        derivedSeller = ownerOnNft;
        setEscrowSeller(ownerOnNft);
        setEscrowStatusText(
          "Seller wallet auto-corrected to NFT owner " + truncateAddress(ownerOnNft) + ". Continue creating escrow..."
        );
      }
    } catch (error) {
      const raw = extractReadableError(error, "Invalid token ID.");
      setEscrowStatusText(mapEscrowError(raw, "Escrow failed: invalid token ID."));
      return;
    }

    const connectedBuyer = (await getConnectedAddress()).toLowerCase();
    if (connectedBuyer === String(derivedSeller).toLowerCase()) {
      setEscrowStatusText(
        "Escrow requires two wallets. Switch to a buyer wallet different from seller " + truncateAddress(derivedSeller) + "."
      );
      return;
    }

    setEscrowLoading(true);
    setEscrowData(null);
    setEscrowStatusText("Creating escrow and locking buyer funds...");

    try {
      const { receipt, escrowId: createdEscrowId } = await createEscrowSale(
        Number(escrowTokenId),
        derivedSeller,
        escrowAmountEth
      );

      setEscrowSeller(derivedSeller);
      setEscrowId(String(createdEscrowId));
      setEscrowLookupId(String(createdEscrowId));
      setEscrowStep(2);
      setEscrowStatusText(
        "Escrow created (ID " +
        createdEscrowId +
        "). Seller must approve token to escrow contract and mark shipped."
      );

      await loadEscrow(createdEscrowId);

      if (typeof window !== "undefined") {
        window.localStorage.setItem("pramaan:lastEscrowId", String(createdEscrowId));
      }

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      if (txHash) {
        setEscrowStatusText(
          "Escrow created (ID " +
          createdEscrowId +
          "). Etherscan: https://sepolia.etherscan.io/tx/" +
          txHash
        );
      }

      if (typeof window !== "undefined") {
        const query = new URLSearchParams();
        if (hash) {
          query.set("hash", hash.trim());
        }
        query.set("escrowId", String(createdEscrowId));
        if (escrowTokenId && /^\d+$/.test(String(escrowTokenId))) {
          query.set("tokenId", String(escrowTokenId));
        }
        const baseUrl = getShareBaseUrl();
        setBuyerShareLink(baseUrl + "/transfer?" + query.toString());
      }
    } catch (error) {
      const raw = extractReadableError(error, "Escrow creation failed.");
      setEscrowStatusText(mapEscrowError(raw, "Escrow creation failed."));
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onAutoFillTokenId() {
    setTokenLookupLoading(true);
    try {
      const connected = await getConnectedAddress();
      const walletsToTry = [
        currentOwner,
        recordState?.record?.artisan,
        connected
      ].filter(Boolean);

      const uniqueWallets = Array.from(new Set(walletsToTry.map((addr) => String(addr).toLowerCase())));

      let resolvedTokenId = 0;
      let matchedWallet = "";

      for (const lowerWallet of uniqueWallets) {
        const originalWallet = walletsToTry.find((addr) => String(addr).toLowerCase() === lowerWallet) || lowerWallet;
        try {
          const tokenId = await findLatestMintedTokenIdByRecipient(originalWallet);
          if (tokenId > 0) {
            resolvedTokenId = tokenId;
            matchedWallet = String(originalWallet);
            break;
          }
        } catch (_lookupError) {
          // Keep trying next candidate wallet.
        }
      }

      if (!resolvedTokenId) {
        throw new Error(
          "No ProductNFT mint found for current owner/artisan/connected wallet on Sepolia. Load product hash first or mint NFT in register flow."
        );
      }

      setEscrowTokenId(String(resolvedTokenId));
      setEscrowStatusText(
        "Auto-filled NFT Token ID " +
        resolvedTokenId +
        " from latest mint for " +
        truncateAddress(matchedWallet) +
        "."
      );
    } catch (error) {
      const raw = extractReadableError(error, "Could not auto-find token ID.");
      setEscrowStatusText(raw || "Could not auto-find token ID.");
    } finally {
      setTokenLookupLoading(false);
    }
  }

  async function onMintNftFromLoadedProduct() {
    if (!recordState?.record) {
      setEscrowStatusText("Load product by hash first.");
      return;
    }

    const recipient = currentOwner;
    if (!recipient || !String(recipient).startsWith("0x")) {
      setEscrowStatusText("Could not determine owner wallet for NFT mint.");
      return;
    }

    const cid = String(recordState.record.ipfsCid || "").trim();
    if (!cid) {
      setEscrowStatusText("Product metadata CID missing; cannot mint NFT twin from this record.");
      return;
    }

    setMintingFromProduct(true);
    setEscrowStatusText("Minting ProductNFT twin from loaded product...");

    try {
      const tokenUri = getIPFSUrl(cid);
      const terroirForMint = Math.max(70, Number(currentTerroir || 70));
      const mintResult = await mintProductTwin(recipient, tokenUri, terroirForMint, cid);

      let tokenId = Number(mintResult?.tokenId || 0);
      if (!tokenId) {
        tokenId = await findLatestMintedTokenIdByRecipient(recipient);
      }

      if (tokenId > 0) {
        setEscrowTokenId(String(tokenId));
        setNftOwnerLive(recipient);
        const mintTxHash =
          mintResult?.receipt?.transactionHash ||
          mintResult?.receipt?.hash ||
          mintResult?.transactionHash ||
          mintResult?.hash ||
          "";

        setEscrowStatusText(
          "Minted ProductNFT Token ID " +
          tokenId +
          (mintTxHash ? ". Tx: https://sepolia.etherscan.io/tx/" + mintTxHash : ".")
        );
      } else {
        setEscrowStatusText("NFT mint sent, but token ID could not be resolved. Click 'Use Latest Minted Token ID'.");
      }
    } catch (error) {
      const raw = extractReadableError(error, "Could not mint ProductNFT twin.");
      setEscrowStatusText(raw || "Could not mint ProductNFT twin.");
    } finally {
      setMintingFromProduct(false);
    }
  }

  async function onApproveTokenForEscrow() {
    if (!escrowId) {
      setEscrowStatusText("Escrow ID is missing. Create or load escrow first.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Approving escrow contract for token transfer...");
    try {
      const details = await getEscrowDetails(Number(escrowId));
      const tokenIdForEscrow = Number(details?.tokenId || 0);
      const escrowSeller = String(details?.seller || "");
      const connected = (await getConnectedAddress()).toLowerCase();

      if (!tokenIdForEscrow) {
        setEscrowStatusText("Could not resolve token ID from escrow details.");
        return;
      }

      if (connected !== escrowSeller.toLowerCase()) {
        setEscrowStatusText(
          "Approve failed: switch to seller wallet " + truncateAddress(escrowSeller) + "."
        );
        return;
      }

      const owner = await getProductNftOwner(tokenIdForEscrow);
      if (String(owner).toLowerCase() !== connected) {
        setEscrowStatusText(
          "Approve failed: connected wallet is not NFT owner " + truncateAddress(owner) + "."
        );
        return;
      }

      setEscrowTokenId(String(tokenIdForEscrow));
      setEscrowSeller(escrowSeller);

      await approveEscrowForToken(tokenIdForEscrow);
      setEscrowStatusText("Token approved for escrow contract.");
    } catch (error) {
      const raw = extractReadableError(error, "Approval failed.");
      setEscrowStatusText(mapEscrowError(raw, "Approval failed."));
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onMarkShipped() {
    if (!escrowId) {
      setEscrowStatusText("Escrow ID is missing. Create escrow first.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Marking escrow as shipped...");
    try {
      const details = await getEscrowDetails(Number(escrowId));
      const tokenIdForEscrow = Number(details?.tokenId || 0);
      const escrowSeller = String(details?.seller || "");
      const connected = (await getConnectedAddress()).toLowerCase();

      if (!tokenIdForEscrow) {
        setEscrowStatusText("Could not resolve token ID from escrow details.");
        return;
      }

      if (connected !== escrowSeller.toLowerCase()) {
        setEscrowStatusText(
          "Mark shipped failed: switch to seller wallet " + truncateAddress(escrowSeller) + "."
        );
        return;
      }

      const owner = await getProductNftOwner(tokenIdForEscrow);
      if (String(owner).toLowerCase() !== connected) {
        setEscrowStatusText(
          "Mark shipped failed: connected wallet is not NFT owner " + truncateAddress(owner) + "."
        );
        return;
      }

      setEscrowTokenId(String(tokenIdForEscrow));
      setEscrowSeller(escrowSeller);

      await markEscrowShipped(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowStep(3);
      setEscrowStatusText("Escrow marked as shipped. Seller should approve token if not already approved.");
    } catch (error) {
      const raw = extractReadableError(error, "Could not mark shipped.");
      setEscrowStatusText(mapEscrowError(raw, "Could not mark shipped."));
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onConfirmEscrow() {
    if (!escrowId) {
      setEscrowStatusText("Escrow ID is missing. Create escrow first.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Validating escrow state and buyer wallet...");
    try {
      const id = Number(escrowId);
      const details = await getEscrowDetails(id);
      const connectedAddress = (await getConnectedAddress()).toLowerCase();

      if (connectedAddress !== String(details.buyer || "").toLowerCase()) {
        setEscrowStatusText(
          "Confirm failed: switch to buyer wallet " + truncateAddress(details.buyer) + " used at escrow creation."
        );
        return;
      }

      if (Number(details.status) !== 2) {
        setEscrowStatusText(
          "Confirm failed: escrow status is " +
          getEscrowStatusLabel(details.status) +
          ". Seller must mark shipped first."
        );
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (Number(details.confirmDeadline || 0) > 0 && now > Number(details.confirmDeadline)) {
        setEscrowStatusText("Confirm failed: confirmation window expired for this escrow.");
        return;
      }

      setEscrowStatusText("Confirming delivery and releasing escrow funds...");
      await confirmEscrowReceived(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowStep(4);
      setEscrowStatusText("Escrow completed. Funds settled and NFT transferred.");
      try {
        const liveOwner = await getProductNftOwner(Number(details.tokenId));
        setNftOwnerLive(liveOwner);
      } catch (_ownerError) {
        setNftOwnerLive("");
      }
    } catch (error) {
      const raw = extractReadableError(error, "Could not confirm receipt.");
      setEscrowStatusText(mapEscrowError(raw, "Could not confirm receipt."));
    } finally {
      setEscrowLoading(false);
    }
  }

  const currentOwner = recordState?.record ? getCurrentOwner(recordState.record) : "";
  const currentTerroir = Number(recordState?.terroir || 0);
  const currentTransferCount = Number(recordState?.record?.transferCount || 0);
  const nextTransferNumber = currentTransferCount + 1;

  const royaltyPercent = calculateRoyaltyPercent(nextTransferNumber);
  const buyerPayment = Number(paymentEth || 0);
  const artisanPayment = (buyerPayment * royaltyPercent) / 100;

  const projectedTerroir = useMemo(() => {
    if (!recordState?.record || newOwnerVerified === null) {
      return null;
    }
    return calculateProjectedTerroir(recordState.record, newOwnerVerified);
  }, [recordState, newOwnerVerified]);

  const decaySamples = [1, 2, 4, 9].map((n) => ({
    n,
    percent: Math.floor(calculateRoyaltyPercent(n))
  }));

  const connectedRole = useMemo(() => {
    if (!escrowData || !connectedWallet) {
      return "viewer";
    }

    const w = connectedWallet.toLowerCase();
    if (w === String(escrowData.buyer || "").toLowerCase()) {
      return "buyer";
    }
    if (w === String(escrowData.seller || "").toLowerCase()) {
      return "seller";
    }
    return "viewer";
  }, [escrowData, connectedWallet]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Escrow Product Transfer</h1>
        <p className="m-0 text-[#49665e]">Escrow-only flow: buyer creates escrow, seller marks shipped, buyer confirms delivery.</p>
        <p className="m-0 text-sm text-[#577]">Network: Sepolia. Amount fields use Sepolia ETH (testnet), not mainnet ETH.</p>
      </div>

      <Card className="max-w-4xl border-[#dbe9e3] bg-[#f7fcfa]">
        <CardHeader className="pb-2">
          <CardTitle>Escrow Role Guide</CardTitle>
          <CardDescription>Use only these roles for this page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-[#355]">
          <p className="m-0">1. Buyer wallet: create escrow (must be different from NFT owner).</p>
          <p className="m-0">2. Seller wallet: mark shipped (must be NFT owner).</p>
          <p className="m-0">3. Buyer wallet: confirm received.</p>
          <p className="m-0 text-sm text-[#577]">Provenance owner and NFT owner can differ. Escrow always uses NFT owner as seller.</p>
        </CardContent>
      </Card>

      <Card className="max-w-4xl">
        <CardHeader className="pb-2">
          <CardTitle>Escrow Transfer (Recommended)</CardTitle>
          <CardDescription>
            Minimal demo flow: create escrow → mark shipped → confirm received.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateEscrow} className="grid gap-3">
            <Input
              suppressHydrationWarning
              required
              type="number"
              min="1"
              value={escrowTokenId}
              onChange={(e) => setEscrowTokenId(e.target.value)}
              placeholder="NFT Token ID"
            />

            <Button
              suppressHydrationWarning
              type="button"
              variant="outline"
              className="w-fit"
              disabled={tokenLookupLoading || escrowLoading}
              onClick={onAutoFillTokenId}
            >
              {tokenLookupLoading ? "Looking up token..." : "Use Latest Minted Token ID"}
            </Button>

            <Button
              suppressHydrationWarning
              type="button"
              variant="outline"
              className="w-fit"
              disabled={mintingFromProduct || escrowLoading || !recordState?.record}
              onClick={onMintNftFromLoadedProduct}
            >
              {mintingFromProduct ? "Minting NFT..." : "Mint NFT From Loaded Product"}
            </Button>

            <Input
              suppressHydrationWarning
              required
              type="number"
              min="0.0001"
              step="0.0001"
              value={escrowAmountEth}
              onChange={(e) => setEscrowAmountEth(e.target.value)}
              placeholder="Price (Sepolia ETH)"
            />

            <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 text-sm text-[#466]">
              <p className="m-0">Provenance owner (this hash): {truncateAddress(currentOwner || escrowSeller)}</p>
              <p className="m-0 mt-1">NFT owner (this token): {truncateAddress(nftOwnerLive)}</p>
              {escrowId && <p className="m-0 mt-1">Escrow ID (auto): {escrowId}</p>}
              <p className="m-0 mt-1">Connected wallet: {truncateAddress(connectedWallet)}</p>
              {escrowData && <p className="m-0 mt-1">Role for loaded escrow: {connectedRole}</p>}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <Input
                suppressHydrationWarning
                type="number"
                min="1"
                value={escrowLookupId}
                onChange={(e) => setEscrowLookupId(e.target.value)}
                placeholder="Load existing Escrow ID"
              />
              <Button
                suppressHydrationWarning
                type="button"
                variant="outline"
                disabled={escrowLoading || !escrowLookupId}
                onClick={() => loadEscrow(escrowLookupId)}
                className="w-fit"
              >
                Load Escrow by ID
              </Button>
            </div>

            {buyerShareLink && (
              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 text-sm text-[#355]">
                <p className="m-0 font-semibold">Buyer Confirm Link (share with friend)</p>
                <p className="m-0 mt-1 break-all">{buyerShareLink}</p>
                {(buyerShareLink.includes("localhost") || buyerShareLink.includes("127.0.0.1")) && (
                  <p className="m-0 mt-2 text-[#8a5b09]">
                    This link is local to your PC. Set NEXT_PUBLIC_APP_URL in frontend/.env.local to your public URL.
                  </p>
                )}
              </div>
            )}

            {escrowStep === 1 && (
              <Button suppressHydrationWarning type="submit" disabled={escrowLoading} className="w-fit">
                {escrowLoading ? "Working..." : "Create Escrow"}
              </Button>
            )}

            {escrowStep === 2 && (
              <div className="flex flex-wrap gap-2">
                <Button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onApproveTokenForEscrow} variant="outline" className="w-fit">
                  {escrowLoading ? "Working..." : "Approve Token"}
                </Button>
                <Button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onMarkShipped} variant="secondary" className="w-fit">
                  {escrowLoading ? "Working..." : "Mark Shipped"}
                </Button>
              </div>
            )}

            {escrowStep === 3 && (
              <Button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onConfirmEscrow} variant="secondary" className="w-fit">
                {escrowLoading ? "Working..." : "Confirm Received"}
              </Button>
            )}

            {escrowStep >= 4 && (
              <Badge variant="default" className="w-fit">Escrow Completed</Badge>
            )}

            {escrowStatusText && <p className="m-0 text-[#355]">{escrowStatusText}</p>}

            {escrowData && (
              <Card className="border-[#dbe9e3] bg-[#f9fcfb]">
                <CardContent className="grid gap-2 pt-6 text-[#355]">
                  <p className="m-0">Escrow ID: {escrowData.id}</p>
                  <p className="m-0">Token ID: {escrowData.tokenId}</p>
                  <p className="m-0">Buyer: {truncateAddress(escrowData.buyer)}</p>
                  <p className="m-0">Seller: {truncateAddress(escrowData.seller)}</p>
                  <p className="m-0">Amount: {escrowData.salePriceEth} ETH</p>
                  <p className="m-0">
                    Status:{" "}
                    <Badge variant={Number(escrowData.status) >= 5 ? "warm" : "default"}>{getEscrowStatusLabel(escrowData.status)}</Badge>
                  </p>
                  {escrowData.disputeReason && <p className="m-0">Dispute: {escrowData.disputeReason}</p>}
                </CardContent>
              </Card>
            )}
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-4xl">
        <CardHeader className="pb-2">
          <CardTitle>Load Product for Transfer</CardTitle>
          <CardDescription>Fetch current ownership and terroir state using the product hash.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); loadProduct(hash); }} className="grid gap-3">
            <Input
              suppressHydrationWarning
              required
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="Product hash (0x...)"
            />
            <Button suppressHydrationWarning type="submit" disabled={loading} className="w-fit">Load Product</Button>
          </form>
        </CardContent>
      </Card>

      {status && <p className="m-0 text-[#355]">{status}</p>}

      {recordState?.record && (
        <>
          <Card className="max-w-4xl">
            <CardHeader className="pb-2">
              <CardTitle>Current Product State</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Product</p>
                <p className="m-0 text-lg font-semibold text-[#20473d]">{recordState.record.productName}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Current Owner</p>
                <p className="m-0 font-mono text-base font-medium text-[#20473d]">{truncateAddress(currentOwner)}</p>
                <p className="m-0 mt-1 text-xs text-[#577]">(Provenance registry owner)</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">NFT Owner (Live)</p>
                <p className="m-0 font-mono text-base font-medium text-[#20473d]">{truncateAddress(nftOwnerLive)}</p>
                <p className="m-0 mt-1 text-xs text-[#577]">Updated by escrow completion</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Transfer Count</p>
                <p className="m-0 text-lg font-semibold text-[#20473d]">{String(currentTransferCount)}</p>
              </div>

              <div className="md:col-span-2 md:max-w-xl">
                <TerritorScore score={currentTerroir} />
              </div>
            </CardContent>
          </Card>

          {!ESCROW_ONLY_MODE && (
            <Card className="max-w-4xl">
              <CardHeader className="pb-2">
                <CardTitle>Direct Transfer and Royalty Preview</CardTitle>
                <CardDescription>Use ENS or wallet address, then confirm transfer with projected impact.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onConfirmTransfer} className="grid gap-3">
                  <Input
                    suppressHydrationWarning
                    required
                    value={newOwnerInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewOwnerInput(value);
                      resolveOwnerInput(value);
                    }}
                    placeholder="New owner wallet address or ENS"
                  />

                  {ensInfo && <p className="m-0 text-[#577]">{ensInfo}</p>}

                  <Input
                    suppressHydrationWarning
                    required
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={paymentEth}
                    onChange={(e) => setPaymentEth(e.target.value)}
                    placeholder="Buyer payment (Sepolia ETH)"
                  />

                  <Card className="border-[#dbe9e3] bg-[#f9fcfb]">
                    <CardHeader className="pb-2">
                      <CardTitle>Quadratic Royalty Calculator</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 text-[#355]">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#d5e7df] bg-white p-3">
                          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Transfer Number</p>
                          <p className="m-0 text-2xl font-bold text-[#20473d]">{nextTransferNumber}</p>
                        </div>
                        <div className="rounded-xl border border-[#d5e7df] bg-white p-3">
                          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Current Royalty</p>
                          <p className="m-0 text-2xl font-bold text-[#1f6d50]">{royaltyPercent.toFixed(2)}%</p>
                        </div>
                      </div>

                      <p className="m-0 text-sm text-[#466]">Formula: royalty = 40% / sqrt(N)</p>

                      <div className="rounded-xl border border-[#d5e7df] bg-white p-3">
                        <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Decay Curve Samples</p>
                        <div className="flex min-h-32 items-end gap-3">
                          {decaySamples.map((item) => (
                            <div key={item.n} className="grid flex-1 justify-items-center gap-1.5">
                              <div
                                style={{
                                  width: "100%",
                                  maxWidth: 56,
                                  height: Math.max(20, item.percent * 2),
                                  background: "#7ec9b1",
                                  border: "1px solid #5eb39a",
                                  borderRadius: 8
                                }}
                              />
                              <div className="text-xs text-[#466]">N={item.n}</div>
                              <div className="text-xs font-semibold text-[#274f45]">{item.percent}%</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#9fd8c0] bg-[#e8f8f1] p-3">
                        <p className="m-0 text-base font-semibold text-[#1f6d50]">
                          Artisan payout: {artisanPayment.toFixed(6)} ETH
                        </p>
                        <p className="m-0 text-sm text-[#355]">from buyer payment of {buyerPayment.toFixed(6)} ETH</p>
                      </div>
                    </CardContent>
                  </Card>

                  {projectedTerroir !== null && (
                    <div
                      className="rounded-xl border px-3 py-2"
                      style={{
                        background: newOwnerVerified ? "#e2f7ed" : "#fff0e0",
                        borderColor: newOwnerVerified ? "#9fd8c0" : "#e7c09f"
                      }}
                    >
                      <div className="font-semibold" style={{ color: newOwnerVerified ? "#186d4c" : "#8a5b09" }}>
                        {newOwnerVerified
                          ? "Score will remain " + currentTerroir + " — verified handler"
                          : "Score will drop from " + currentTerroir + " to " + projectedTerroir + " — unverified handler detected"}
                      </div>
                    </div>
                  )}

                  <Button suppressHydrationWarning disabled={loading} type="submit" className="w-fit">
                    {loading ? "Processing..." : "Confirm Transfer"}
                  </Button>

                  {stepProgress && (
                    <div className="rounded-lg border border-dashed border-[#b4d8cb] bg-[#eff8f4] px-3 py-2 text-[#2f5a50]">
                      {stepProgress}
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          )}

          {!ESCROW_ONLY_MODE && transferSuccess && (
            <Card className="max-w-4xl border-[#cde6dc] bg-[#f4fbf8]">
              <CardHeader className="pb-2">
                <CardTitle className="text-[#1f6d50]">Transfer Completed</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-[#355]">
                <p className="m-0">New Terroir Score: {transferSuccess.newTerroir}</p>
                <p className="m-0">Artisan payment: {transferSuccess.artisanPaymentEth} ETH</p>
                {transferSuccess.retailerQrUrl && (
                  <Link href={transferSuccess.retailerQrUrl} className="w-fit no-underline">
                    <Button type="button" variant="outline">Generate Retailer QR</Button>
                  </Link>
                )}
                {transferSuccess.txUrl && (
                  <p className="m-0">
                    Etherscan:{" "}
                    <a href={transferSuccess.txUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#176f52] no-underline">View tx</a>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="max-w-4xl">
            <CardContent className="pt-6 text-[#466]">
              <p className="m-0">
                Consumer verification link:{" "}
                <Link href={"/verify?hash=" + hash} className="font-semibold text-[#176f52] no-underline">
                  /verify?hash={hash}
                </Link>
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
