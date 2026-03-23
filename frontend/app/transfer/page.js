"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import TerritorScore from "../../components/TerritorScore";
import StatusMessage, { ProgressSteps } from "../../components/StatusMessage";
import {
  approveEscrowForToken,
  confirmEscrowReceived,
  createEscrowSale,
  getArtisan,
  getEscrowDetails,
  markEscrowShipped,
  raiseEscrowDispute,
  transferProduct,
  verifyProduct,
  cancelEscrowExpired
} from "../../src/utils/contract";
import { RPC_URL } from "../../src/utils/constants";
import { appendEvidenceEntry } from "../../src/utils/evidence";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL)
});

// User-friendly messages
const MESSAGES = {
  loadingProduct: "Loading product details from the blockchain...",
  productLoaded: "Product loaded successfully.",
  productNotFound: "Could not find this product. Please check the hash and try again.",
  resolvingAddress: "Resolving wallet address...",
  invalidAddress: "Please enter a valid wallet address (0x...) or ENS name.",
  ensResolved: "ENS name resolved successfully.",
  ensFailed: "Could not resolve this ENS name. Please check the spelling or use a wallet address instead.",
  transferring: "Transferring ownership and processing artisan royalty payment...",
  transferSuccess: "Ownership transferred successfully! The artisan has received their royalty payment.",
  transferFailed: "Could not complete the transfer. Please try again.",
  escrowCreating: "Creating secure escrow and locking buyer funds...",
  escrowCreated: "Escrow created successfully. The seller should now approve their token and mark it as shipped.",
  escrowApproving: "Approving escrow contract to transfer your token...",
  escrowApproved: "Token approved for escrow.",
  escrowShipping: "Recording shipment on the blockchain...",
  escrowShipped: "Item marked as shipped. The buyer can now confirm receipt.",
  escrowConfirming: "Confirming delivery and releasing funds to seller...",
  escrowCompleted: "Transaction complete! Funds have been released and the product has been transferred.",
  escrowCancelling: "Cancelling escrow and refunding buyer...",
  escrowCancelled: "Escrow cancelled. Funds have been returned to the buyer.",
  disputeRaising: "Recording dispute on the blockchain...",
  disputeRaised: "Dispute has been recorded. An arbitrator will review this case."
};

export default function TransferPage() {
  const [hash, setHash] = useState("");
  const [recordState, setRecordState] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);

  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [ensInfo, setEnsInfo] = useState("");
  const [newOwnerVerified, setNewOwnerVerified] = useState(null);

  const [paymentEth, setPaymentEth] = useState("0.05");
  const [transferSuccess, setTransferSuccess] = useState(null);

  const [escrowTokenId, setEscrowTokenId] = useState("");
  const [escrowSeller, setEscrowSeller] = useState("");
  const [escrowAmountEth, setEscrowAmountEth] = useState("0.05");
  const [escrowId, setEscrowId] = useState("");
  const [escrowDisputeReason, setEscrowDisputeReason] = useState("Item not as described");
  const [escrowLoading, setEscrowLoading] = useState(false);
  const [escrowMessage, setEscrowMessage] = useState({ type: "", text: "" });
  const [escrowData, setEscrowData] = useState(null);

  const transferSteps = [
    "Transferring ownership",
    "Processing artisan royalty"
  ];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hashFromUrl = params.get("hash") || "";

    if (!hashFromUrl) {
      return;
    }

    setHash(hashFromUrl);
    loadProduct(hashFromUrl);
  }, []);

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
      setMessage({ type: "warning", text: "Please enter a product hash." });
      return;
    }

    setLoading(true);
    setMessage({ type: "progress", text: MESSAGES.loadingProduct });
    setTransferSuccess(null);

    try {
      const data = await verifyProduct(clean);
      setRecordState(data);
      setMessage({ type: "success", text: MESSAGES.productLoaded });
    } catch (error) {
      setRecordState(null);
      setMessage({ type: "error", text: error?.shortMessage || error?.message || MESSAGES.productNotFound });
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
          setEnsInfo(MESSAGES.ensResolved + " (" + truncateAddress(ensAddress) + ")");
        } else {
          setEnsInfo(MESSAGES.ensFailed);
          return;
        }
      } catch (_error) {
        setEnsInfo(MESSAGES.ensFailed);
        return;
      }
    }

    if (!candidate.startsWith("0x") || candidate.length !== 42) {
      setEnsInfo(MESSAGES.invalidAddress);
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
      setMessage({ type: "warning", text: "Please load a product first." });
      return;
    }

    const targetAddress = resolvedAddress || newOwnerInput.trim();
    if (!targetAddress || !targetAddress.startsWith("0x") || targetAddress.length !== 42) {
      setMessage({ type: "warning", text: MESSAGES.invalidAddress });
      return;
    }

    setLoading(true);
    setTransferSuccess(null);
    setCurrentStep(0);
    setMessage({ type: "progress", text: MESSAGES.transferring });

    try {
      const transferNumber = Number(recordState.record.transferCount || 0) + 1;
      const royaltyPercent = calculateRoyaltyPercent(transferNumber);
      const buyerPayment = Number(paymentEth || 0);
      const artisanPayment = (buyerPayment * royaltyPercent) / 100;

      const receipt = await transferProduct(hash.trim(), targetAddress, paymentEth);

      setCurrentStep(1);

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
        artisanPaymentEth: artisanPayment.toFixed(6)
      });
      setMessage({ type: "success", text: MESSAGES.transferSuccess });
    } catch (error) {
      setMessage({ type: "error", text: error?.shortMessage || error?.message || MESSAGES.transferFailed });
    } finally {
      setLoading(false);
      setCurrentStep(-1);
    }
  }

  function getEscrowStatusLabel(status) {
    const labels = {
      0: "Not Started",
      1: "Created - Awaiting Shipment",
      2: "Shipped - Awaiting Delivery",
      3: "Completed",
      4: "Refunded",
      5: "Disputed",
      6: "Resolved"
    };
    return labels[Number(status)] || "Unknown";
  }

  function getEscrowStatusType(status) {
    const types = {
      0: "info",
      1: "warning",
      2: "info",
      3: "success",
      4: "warning",
      5: "error",
      6: "success"
    };
    return types[Number(status)] || "info";
  }

  async function loadEscrow(idValue) {
    const id = Number(idValue);
    if (!Number.isFinite(id) || id <= 0) {
      setEscrowMessage({ type: "warning", text: "Please enter a valid escrow ID." });
      return;
    }

    setEscrowLoading(true);
    try {
      const details = await getEscrowDetails(id);
      setEscrowData(details);
      setEscrowMessage({ type: "success", text: "Escrow details loaded." });
    } catch (error) {
      setEscrowData(null);
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not load escrow details." });
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onCreateEscrow(event) {
    event.preventDefault();

    if (!escrowTokenId || !escrowSeller) {
      setEscrowMessage({ type: "warning", text: "Please enter a token ID and seller address." });
      return;
    }

    setEscrowLoading(true);
    setEscrowData(null);
    setEscrowMessage({ type: "progress", text: MESSAGES.escrowCreating });

    try {
      const { receipt, escrowId: createdEscrowId } = await createEscrowSale(
        Number(escrowTokenId),
        escrowSeller,
        escrowAmountEth
      );

      setEscrowId(String(createdEscrowId));

      await loadEscrow(createdEscrowId);

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      setEscrowMessage({
        type: "success",
        text: MESSAGES.escrowCreated + (txHash ? " View transaction: " + txHash.slice(0, 10) + "..." : "")
      });
    } catch (error) {
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not create escrow." });
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onApproveTokenForEscrow() {
    if (!escrowTokenId) {
      setEscrowMessage({ type: "warning", text: "Please enter a token ID." });
      return;
    }

    setEscrowLoading(true);
    setEscrowMessage({ type: "progress", text: MESSAGES.escrowApproving });
    try {
      await approveEscrowForToken(Number(escrowTokenId));
      setEscrowMessage({ type: "success", text: MESSAGES.escrowApproved });
    } catch (error) {
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not approve token." });
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onMarkShipped() {
    if (!escrowId) {
      setEscrowMessage({ type: "warning", text: "Please enter an escrow ID." });
      return;
    }

    setEscrowLoading(true);
    setEscrowMessage({ type: "progress", text: MESSAGES.escrowShipping });
    try {
      await markEscrowShipped(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowMessage({ type: "success", text: MESSAGES.escrowShipped });
    } catch (error) {
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not mark as shipped." });
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onConfirmEscrow() {
    if (!escrowId) {
      setEscrowMessage({ type: "warning", text: "Please enter an escrow ID." });
      return;
    }

    setEscrowLoading(true);
    setEscrowMessage({ type: "progress", text: MESSAGES.escrowConfirming });
    try {
      await confirmEscrowReceived(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowMessage({ type: "success", text: MESSAGES.escrowCompleted });
    } catch (error) {
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not confirm receipt." });
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onCancelEscrow() {
    if (!escrowId) {
      setEscrowMessage({ type: "warning", text: "Please enter an escrow ID." });
      return;
    }

    setEscrowLoading(true);
    setEscrowMessage({ type: "progress", text: MESSAGES.escrowCancelling });
    try {
      await cancelEscrowExpired(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowMessage({ type: "success", text: MESSAGES.escrowCancelled });
    } catch (error) {
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not cancel escrow." });
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onRaiseDispute() {
    if (!escrowId) {
      setEscrowMessage({ type: "warning", text: "Please enter an escrow ID." });
      return;
    }

    setEscrowLoading(true);
    setEscrowMessage({ type: "progress", text: MESSAGES.disputeRaising });
    try {
      await raiseEscrowDispute(Number(escrowId), escrowDisputeReason);
      await loadEscrow(escrowId);
      setEscrowMessage({ type: "warning", text: MESSAGES.disputeRaised });
    } catch (error) {
      setEscrowMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not raise dispute." });
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

  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Transfer Product</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          Transfer ownership with automatic artisan royalty payments. You can use direct transfer or secure escrow.
        </p>
      </div>

      {/* Escrow Section */}
      <div className="card-form card-container">
        <h3 style={{ margin: 0, color: "var(--color-primary-dark)" }}>Secure Escrow Transfer</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
          Recommended for high-value items. Buyer funds are held securely until delivery is confirmed.
        </p>

        <form onSubmit={onCreateEscrow} style={{ display: "grid", gap: "var(--space-md)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
            <div>
              <label htmlFor="escrow-token" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600, fontSize: 14 }}>
                NFT Token ID
              </label>
              <input
                id="escrow-token"
                suppressHydrationWarning
                required
                type="number"
                min="1"
                value={escrowTokenId}
                onChange={(e) => setEscrowTokenId(e.target.value)}
                placeholder="e.g., 1"
                className="input-base"
              />
            </div>
            <div>
              <label htmlFor="escrow-amount" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600, fontSize: 14 }}>
                Amount (ETH)
              </label>
              <input
                id="escrow-amount"
                suppressHydrationWarning
                required
                type="number"
                min="0.0001"
                step="0.0001"
                value={escrowAmountEth}
                onChange={(e) => setEscrowAmountEth(e.target.value)}
                placeholder="0.05"
                className="input-base"
              />
            </div>
          </div>

          <div>
            <label htmlFor="escrow-seller" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600, fontSize: 14 }}>
              Seller Wallet Address
            </label>
            <input
              id="escrow-seller"
              suppressHydrationWarning
              required
              value={escrowSeller}
              onChange={(e) => setEscrowSeller(e.target.value)}
              placeholder="0x..."
              className="input-base"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>

          <button suppressHydrationWarning type="submit" disabled={escrowLoading} className="btn-base btn-primary" style={{ width: "fit-content" }}>
            {escrowLoading ? "Processing..." : "Create Escrow"}
          </button>
        </form>

        {/* Escrow Actions */}
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-md)", marginTop: "var(--space-sm)" }}>
          <p style={{ margin: "0 0 var(--space-sm)", fontWeight: 600, fontSize: 14 }}>Manage Existing Escrow</p>
          
          <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-md)", flexWrap: "wrap" }}>
            <input
              suppressHydrationWarning
              value={escrowId}
              onChange={(e) => setEscrowId(e.target.value)}
              placeholder="Escrow ID"
              className="input-base"
              style={{ width: 120 }}
            />
            <button
              suppressHydrationWarning
              type="button"
              disabled={escrowLoading || !escrowId}
              onClick={() => loadEscrow(escrowId)}
              className="btn-base btn-secondary"
            >
              Load
            </button>
          </div>

          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <button suppressHydrationWarning type="button" disabled={escrowLoading} onClick={onApproveTokenForEscrow} className="btn-base btn-secondary">
              Approve Token
            </button>
            <button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onMarkShipped} className="btn-base btn-secondary">
              Mark Shipped
            </button>
            <button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onConfirmEscrow} className="btn-base btn-primary">
              Confirm Received
            </button>
            <button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onCancelEscrow} className="btn-base btn-danger">
              Cancel
            </button>
          </div>

          {/* Dispute Section */}
          <div style={{ marginTop: "var(--space-md)", display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="dispute-reason" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600, fontSize: 14 }}>
                Dispute Reason
              </label>
              <input
                id="dispute-reason"
                suppressHydrationWarning
                value={escrowDisputeReason}
                onChange={(e) => setEscrowDisputeReason(e.target.value)}
                placeholder="Reason for dispute"
                className="input-base"
              />
            </div>
            <button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onRaiseDispute} className="btn-base btn-danger">
              Raise Dispute
            </button>
          </div>
        </div>

        {/* Escrow Status Message */}
        {escrowMessage.text && (
          <StatusMessage type={escrowMessage.type || "info"} message={escrowMessage.text} />
        )}

        {/* Escrow Data Display */}
        {escrowData && (
          <div className="card-base" style={{ background: "#f8fcfb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-sm)" }}>
              <h4 style={{ margin: 0, color: "var(--color-primary-dark)" }}>Escrow #{escrowData.id}</h4>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12,
                  fontWeight: 700,
                  background: getEscrowStatusType(escrowData.status) === "success" ? "var(--color-success-bg)" :
                             getEscrowStatusType(escrowData.status) === "error" ? "var(--color-error-bg)" :
                             getEscrowStatusType(escrowData.status) === "warning" ? "var(--color-warning-bg)" : "var(--color-info-bg)",
                  color: getEscrowStatusType(escrowData.status) === "success" ? "var(--color-success)" :
                         getEscrowStatusType(escrowData.status) === "error" ? "var(--color-error)" :
                         getEscrowStatusType(escrowData.status) === "warning" ? "var(--color-warning)" : "var(--color-info)"
                }}
              >
                {getEscrowStatusLabel(escrowData.status)}
              </span>
            </div>
            <div style={{ marginTop: "var(--space-md)", display: "grid", gap: "var(--space-xs)" }}>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}><strong>Token ID:</strong> {escrowData.tokenId}</p>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}><strong>Buyer:</strong> {truncateAddress(escrowData.buyer)}</p>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}><strong>Seller:</strong> {truncateAddress(escrowData.seller)}</p>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}><strong>Amount:</strong> {escrowData.salePriceEth} ETH</p>
              {escrowData.disputeReason && (
                <p style={{ margin: 0, color: "var(--color-error)" }}><strong>Dispute:</strong> {escrowData.disputeReason}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Direct Transfer Section */}
      <div className="card-form card-container">
        <h3 style={{ margin: 0, color: "var(--color-primary-dark)" }}>Direct Transfer</h3>
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
          For trusted transactions. Load a product, then transfer ownership directly.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); loadProduct(hash); }} style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <input
            suppressHydrationWarning
            required
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="Product hash (0x...)"
            className="input-base"
            style={{ flex: 1, minWidth: 200, fontFamily: "var(--font-mono)" }}
          />
          <button suppressHydrationWarning type="submit" disabled={loading} className="btn-base btn-secondary">
            Load Product
          </button>
        </form>
      </div>

      {/* Status Message */}
      {message.text && !recordState?.record && (
        <div className="card-container">
          <StatusMessage type={message.type || "info"} message={message.text} />
        </div>
      )}

      {/* Product Details & Transfer Form */}
      {recordState?.record && (
        <>
          {/* Current Product State */}
          <div className="card-base card-container">
            <h3 style={{ margin: "0 0 var(--space-md)", color: "var(--color-primary-dark)" }}>Product Details</h3>
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                <strong>Product:</strong> {recordState.record.productName}
              </p>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                <strong>Current Owner:</strong> {truncateAddress(currentOwner)}
              </p>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                <strong>Transfer Count:</strong> {String(currentTransferCount)}
              </p>
            </div>
            <div style={{ maxWidth: 320, marginTop: "var(--space-md)" }}>
              <TerritorScore score={currentTerroir} />
            </div>
          </div>

          {/* Transfer Form */}
          <form onSubmit={onConfirmTransfer} className="card-form card-container">
            <h3 style={{ margin: 0, color: "var(--color-primary-dark)" }}>Transfer Ownership</h3>

            <div>
              <label htmlFor="new-owner" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
                New Owner Address or ENS
              </label>
              <input
                id="new-owner"
                suppressHydrationWarning
                required
                value={newOwnerInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewOwnerInput(value);
                  resolveOwnerInput(value);
                }}
                placeholder="0x... or name.eth"
                className="input-base"
                style={{ fontFamily: "var(--font-mono)" }}
              />
              {ensInfo && (
                <p style={{ margin: "var(--space-xs) 0 0", fontSize: 13, color: ensInfo.includes("resolved") ? "var(--color-success)" : "var(--color-warning)" }}>
                  {ensInfo}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="payment-amount" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
                Payment Amount (ETH)
              </label>
              <input
                id="payment-amount"
                suppressHydrationWarning
                required
                type="number"
                min="0.0001"
                step="0.0001"
                value={paymentEth}
                onChange={(e) => setPaymentEth(e.target.value)}
                placeholder="0.05"
                className="input-base"
              />
            </div>

            {/* Royalty Info Card */}
            <div className="card-base" style={{ background: "#f8fcfb" }}>
              <h4 style={{ margin: "0 0 var(--space-md)", color: "var(--color-primary-dark)" }}>Artisan Royalty</h4>
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
                The original artisan receives a royalty on every transfer. This percentage decreases with each sale using a quadratic formula.
              </p>
              
              {/* Royalty Visualization */}
              <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "flex-end", marginTop: "var(--space-md)", minHeight: 100 }}>
                {decaySamples.map((item) => (
                  <div key={item.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div
                      style={{
                        width: 40,
                        height: item.percent * 2,
                        background: item.n === nextTransferNumber ? "var(--color-primary)" : "#7ec9b1",
                        border: item.n === nextTransferNumber ? "2px solid var(--color-primary-dark)" : "1px solid #5eb39a",
                        borderRadius: "var(--radius-sm)"
                      }}
                    />
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>#{item.n}</div>
                    <div style={{ fontSize: 12, color: "var(--color-primary-dark)", fontWeight: 700 }}>{item.percent}%</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", background: "var(--color-success-bg)", borderRadius: "var(--radius-md)" }}>
                <p style={{ margin: 0, color: "var(--color-success)", fontWeight: 700 }}>
                  For this transfer: Artisan receives {artisanPayment.toFixed(6)} ETH ({royaltyPercent.toFixed(1)}% of {buyerPayment.toFixed(6)} ETH)
                </p>
              </div>
            </div>

            {/* Terroir Impact Preview */}
            {projectedTerroir !== null && (
              <StatusMessage
                type={newOwnerVerified ? "success" : "warning"}
                title={newOwnerVerified ? "Verified Handler" : "Unverified Handler Warning"}
                message={newOwnerVerified
                  ? `Authenticity score will remain at ${currentTerroir} because this new owner is a verified artisan.`
                  : `Authenticity score will drop from ${currentTerroir} to ${projectedTerroir} because this new owner is not a verified artisan.`}
              />
            )}

            <button suppressHydrationWarning disabled={loading} type="submit" className="btn-base btn-primary" style={{ width: "100%" }}>
              {loading ? "Processing transfer..." : "Confirm Transfer"}
            </button>

            {/* Progress Steps */}
            {currentStep >= 0 && (
              <ProgressSteps currentStep={currentStep} steps={transferSteps} />
            )}
          </form>

          {/* Status Message */}
          {message.text && (
            <div className="card-container">
              <StatusMessage type={message.type || "info"} message={message.text} />
            </div>
          )}

          {/* Transfer Success */}
          {transferSuccess && (
            <div className="card-base card-container" style={{ borderColor: "var(--color-success)" }}>
              <h3 style={{ margin: "0 0 var(--space-md)", color: "var(--color-success)" }}>Transfer Complete</h3>
              <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                  <strong>New Authenticity Score:</strong> {transferSuccess.newTerroir}
                </p>
                <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                  <strong>Artisan Royalty Paid:</strong> {transferSuccess.artisanPaymentEth} ETH
                </p>
                {transferSuccess.txUrl && (
                  <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                    <strong>Transaction:</strong>{" "}
                    <a href={transferSuccess.txUrl} target="_blank" rel="noreferrer" className="link-primary">
                      View on Etherscan
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Verification Link */}
          <div className="card-base card-container">
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              <strong>Verification Link:</strong>{" "}
              <Link href={"/verify?hash=" + hash} className="link-primary">
                /verify?hash={hash.slice(0, 10)}...
              </Link>
            </p>
          </div>
        </>
      )}
    </section>
  );
}
