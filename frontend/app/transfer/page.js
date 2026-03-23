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

export default function TransferPage() {
  const [hash, setHash] = useState("");
  const [recordState, setRecordState] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepProgress, setStepProgress] = useState("");

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
  const [escrowDisputeReason, setEscrowDisputeReason] = useState("Buyer raised dispute");
  const [escrowLoading, setEscrowLoading] = useState(false);
  const [escrowStatusText, setEscrowStatusText] = useState("");
  const [escrowData, setEscrowData] = useState(null);

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
      setStatus("Enter a product hash.");
      return;
    }

    setLoading(true);
    setStatus("Loading product from Sepolia...");
    setTransferSuccess(null);

    try {
      const data = await verifyProduct(clean);
      setRecordState(data);
      setStatus("Product loaded.");
    } catch (error) {
      setRecordState(null);
      setStatus(error?.shortMessage || error?.message || "Could not load product.");
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

    setLoading(true);
    setTransferSuccess(null);
    setStepProgress("Step 1/2: Transferring ownership...");

    try {
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
      setStatus(error?.shortMessage || error?.message || "Transfer failed.");
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

  async function loadEscrow(idValue) {
    const id = Number(idValue);
    if (!Number.isFinite(id) || id <= 0) {
      setEscrowStatusText("Provide a valid escrow ID.");
      return;
    }

    setEscrowLoading(true);
    try {
      const details = await getEscrowDetails(id);
      setEscrowData(details);
      setEscrowStatusText("Escrow details loaded.");
    } catch (error) {
      setEscrowData(null);
      setEscrowStatusText(error?.shortMessage || error?.message || "Could not load escrow details.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onCreateEscrow(event) {
    event.preventDefault();

    if (!escrowTokenId || !escrowSeller) {
      setEscrowStatusText("Token ID and seller are required.");
      return;
    }

    setEscrowLoading(true);
    setEscrowData(null);
    setEscrowStatusText("Creating escrow and locking buyer funds...");

    try {
      const { receipt, escrowId: createdEscrowId } = await createEscrowSale(
        Number(escrowTokenId),
        escrowSeller,
        escrowAmountEth
      );

      setEscrowId(String(createdEscrowId));
      setEscrowStatusText(
        "Escrow created (ID " +
        createdEscrowId +
        "). Seller must approve token to escrow contract and mark shipped."
      );

      await loadEscrow(createdEscrowId);

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      if (txHash) {
        setEscrowStatusText(
          "Escrow created (ID " +
          createdEscrowId +
          "). Etherscan: https://sepolia.etherscan.io/tx/" +
          txHash
        );
      }
    } catch (error) {
      setEscrowStatusText(error?.shortMessage || error?.message || "Escrow creation failed.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onApproveTokenForEscrow() {
    if (!escrowTokenId) {
      setEscrowStatusText("Enter token ID to approve.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Approving escrow contract for token transfer...");
    try {
      await approveEscrowForToken(Number(escrowTokenId));
      setEscrowStatusText("Token approved for escrow contract.");
    } catch (error) {
      setEscrowStatusText(error?.shortMessage || error?.message || "Approval failed.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onMarkShipped() {
    if (!escrowId) {
      setEscrowStatusText("Enter escrow ID.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Marking escrow as shipped...");
    try {
      await markEscrowShipped(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowStatusText("Escrow marked as shipped.");
    } catch (error) {
      setEscrowStatusText(error?.shortMessage || error?.message || "Could not mark shipped.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onConfirmEscrow() {
    if (!escrowId) {
      setEscrowStatusText("Enter escrow ID.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Confirming delivery and releasing escrow funds...");
    try {
      await confirmEscrowReceived(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowStatusText("Escrow completed. Funds settled and NFT transferred.");
    } catch (error) {
      setEscrowStatusText(error?.shortMessage || error?.message || "Could not confirm receipt.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onCancelEscrow() {
    if (!escrowId) {
      setEscrowStatusText("Enter escrow ID.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Attempting escrow cancellation...");
    try {
      await cancelEscrowExpired(Number(escrowId));
      await loadEscrow(escrowId);
      setEscrowStatusText("Escrow cancelled and refunded.");
    } catch (error) {
      setEscrowStatusText(error?.shortMessage || error?.message || "Could not cancel escrow.");
    } finally {
      setEscrowLoading(false);
    }
  }

  async function onRaiseDispute() {
    if (!escrowId) {
      setEscrowStatusText("Enter escrow ID.");
      return;
    }

    setEscrowLoading(true);
    setEscrowStatusText("Raising escrow dispute...");
    try {
      await raiseEscrowDispute(Number(escrowId), escrowDisputeReason);
      await loadEscrow(escrowId);
      setEscrowStatusText("Dispute raised. Await arbitrator resolution.");
    } catch (error) {
      setEscrowStatusText(error?.shortMessage || error?.message || "Could not raise dispute.");
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
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Transfer Product Ownership</h1>
        <p className="m-0 text-[#49665e]">Transfer ownership with quadratic royalty and terroir impact preview.</p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader className="pb-2">
          <CardTitle>Escrow Transfer (Recommended)</CardTitle>
          <CardDescription>
            Buyer creates escrow, seller marks shipped, buyer confirms delivery to release funds and transfer NFT.
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

            <Input
              suppressHydrationWarning
              required
              value={escrowSeller}
              onChange={(e) => setEscrowSeller(e.target.value)}
              placeholder="Seller wallet (0x...)"
            />

            <Input
              suppressHydrationWarning
              required
              type="number"
              min="0.0001"
              step="0.0001"
              value={escrowAmountEth}
              onChange={(e) => setEscrowAmountEth(e.target.value)}
              placeholder="Escrow amount (ETH)"
            />

            <Button suppressHydrationWarning type="submit" disabled={escrowLoading} className="w-fit">
              {escrowLoading ? "Working..." : "Create Escrow"}
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button suppressHydrationWarning type="button" disabled={escrowLoading} onClick={onApproveTokenForEscrow} variant="secondary">
                Approve Token for Escrow
              </Button>
              <Button suppressHydrationWarning type="button" disabled={escrowLoading} onClick={onMarkShipped} variant="secondary">
                Mark Shipped
              </Button>
              <Button suppressHydrationWarning type="button" disabled={escrowLoading} onClick={onConfirmEscrow} variant="secondary">
                Confirm Received
              </Button>
              <Button suppressHydrationWarning type="button" disabled={escrowLoading} onClick={onCancelEscrow} variant="secondary">
                Cancel Expired
              </Button>
            </div>

            <Input
              suppressHydrationWarning
              value={escrowId}
              onChange={(e) => setEscrowId(e.target.value)}
              placeholder="Escrow ID"
            />

            <Button
              suppressHydrationWarning
              type="button"
              disabled={escrowLoading || !escrowId}
              onClick={() => loadEscrow(escrowId)}
              variant="secondary"
              className="w-fit"
            >
              Load Escrow
            </Button>

            <Input
              suppressHydrationWarning
              value={escrowDisputeReason}
              onChange={(e) => setEscrowDisputeReason(e.target.value)}
              placeholder="Dispute reason"
            />
            <Button suppressHydrationWarning type="button" disabled={escrowLoading || !escrowId} onClick={onRaiseDispute} variant="secondary" className="w-fit">
              Raise Dispute
            </Button>

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
                  placeholder="Buyer payment (ETH)"
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

          {transferSuccess && (
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
