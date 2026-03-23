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
import { checkpointScanNonce, getArtisan, getArtisanTokenId, isScanNonceUsed, verifyProduct } from "../../src/utils/contract";
import { makeScanNonce } from "../../src/utils/hash";
import { getIPFSUrl } from "../../src/utils/ipfs";
import { PRODUCT_REGISTRY_ADDRESS, RPC_URL } from "../../src/utils/constants";
import { appendEvidenceEntry } from "../../src/utils/evidence";

const PRODUCT_REGISTERED_EVENT = {
  type: "event",
  name: "ProductRegistered",
  inputs: [
    { indexed: true, name: "productHash", type: "bytes32" },
    { indexed: true, name: "artisan", type: "address" },
    { indexed: false, name: "giTag", type: "string" }
  ]
};

const PRODUCT_TRANSFERRED_EVENT = {
  type: "event",
  name: "ProductTransferred",
  inputs: [
    { indexed: true, name: "productHash", type: "bytes32" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "transferCount", type: "uint256" },
    { indexed: false, name: "royaltyBps", type: "uint256" },
    { indexed: false, name: "royaltyAmount", type: "uint256" }
  ]
};

const RESULT = {
  AUTHENTIC: "AUTHENTIC",
  CAUTION: "CAUTION",
  COMPROMISED: "COMPROMISED",
  NOT_FOUND: "NOT_FOUND",
  NONE: "NONE"
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL)
});

async function resolveAssetUrls(cid) {
  const metadataUrl = getIPFSUrl(cid);

  try {
    const response = await fetch(metadataUrl, { cache: "no-store" });
    if (!response.ok) {
      return { metadataUrl, imageUrl: metadataUrl };
    }

    const json = await response.json();
    const imageCid = String(json?.imageCid || json?.image || "").trim();
    if (!imageCid) {
      return { metadataUrl, imageUrl: metadataUrl };
    }

    const normalizedImageCid = imageCid.startsWith("ipfs://") ? imageCid.slice("ipfs://".length) : imageCid;
    return { metadataUrl, imageUrl: getIPFSUrl(normalizedImageCid) };
  } catch (_error) {
    return { metadataUrl, imageUrl: metadataUrl };
  }
}

export default function VerifyPage() {
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [resultType, setResultType] = useState(RESULT.NONE);
  const [resultData, setResultData] = useState(null);
  const [autoVerified, setAutoVerified] = useState(false);
  const [scanNonce, setScanNonce] = useState("");
  const [checkpointLoading, setCheckpointLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hashFromUrl = params.get("hash") || "";

    if (!hashFromUrl || autoVerified) {
      return;
    }

    setHash(hashFromUrl);
    setAutoVerified(true);
    runVerification(hashFromUrl);
  }, [autoVerified]);

  function truncateAddress(address) {
    if (!address) {
      return "-";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  function formatDate(timestampSeconds) {
    if (!timestampSeconds) {
      return "Unknown";
    }
    const ms = Number(timestampSeconds) * 1000;
    return new Date(ms).toLocaleString();
  }

  function deriveRegionFromCoordinates(latRaw, lngRaw) {
    const lat = Number(latRaw) / 1000000;
    const lng = Number(lngRaw) / 1000000;

    if (lat >= 21 && lat <= 28 && lng >= 85 && lng <= 90) {
      return "West Bengal, India";
    }

    if (lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98) {
      return "India";
    }

    return "Unknown Region";
  }

  async function fetchProductEventMetadata(productHash) {
    const out = {
      registrationTxHash: "",
      registrationTimestamp: null,
      transferTimestampsByCount: {}
    };

    if (!PRODUCT_REGISTRY_ADDRESS || PRODUCT_REGISTRY_ADDRESS === "PASTE_ADDRESS_HERE") {
      return out;
    }

    const registeredLogs = await publicClient.getLogs({
      address: PRODUCT_REGISTRY_ADDRESS,
      event: PRODUCT_REGISTERED_EVENT,
      args: { productHash }
    });

    if (registeredLogs.length > 0) {
      const log = registeredLogs[0];
      out.registrationTxHash = log.transactionHash || "";

      if (typeof log.blockNumber !== "undefined") {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
        out.registrationTimestamp = Number(block.timestamp);
      }
    }

    const transferLogs = await publicClient.getLogs({
      address: PRODUCT_REGISTRY_ADDRESS,
      event: PRODUCT_TRANSFERRED_EVENT,
      args: { productHash }
    });

    for (const log of transferLogs) {
      const count = Number(log.args.transferCount);
      if (typeof log.blockNumber !== "undefined") {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
        out.transferTimestampsByCount[count] = Number(block.timestamp);
      }
    }

    return out;
  }

  async function runVerification(inputHash) {
    const cleanHash = String(inputHash || "").trim();
    if (!cleanHash) {
      setStatus("Please enter a product hash.");
      return;
    }

    setLoading(true);
    setStatus("Reading verification from Sepolia...");
    setResultType(RESULT.NONE);
    setResultData(null);

    try {
      const { record, terroir } = await verifyProduct(cleanHash);
      const artisan = await getArtisan(record.artisan);
      const sbtId = await getArtisanTokenId(record.artisan);
      const eventMeta = await fetchProductEventMetadata(cleanHash);
      const { metadataUrl, imageUrl } = await resolveAssetUrls(record.ipfsCid);
      const activeNonce = /^0x[0-9a-fA-F]{64}$/.test(scanNonce) ? scanNonce : makeScanNonce();
      const nonceUsed = Boolean(await isScanNonceUsed(cleanHash, activeNonce));
      setScanNonce(activeNonce);

      const unverifiedCount = Array.isArray(record.handlerVerified)
        ? record.handlerVerified.filter((value) => !value).length
        : 0;

      const handlerChain = [
        {
          label: "Artisan",
          wallet: record.artisan,
          verified: true,
          timestamp: eventMeta.registrationTimestamp || Number(record.registeredAt)
        },
        ...(record.handlers || []).map((wallet, index) => ({
          label: "Handler " + (index + 1),
          wallet,
          verified: Boolean(record.handlerVerified?.[index]),
          timestamp: eventMeta.transferTimestampsByCount[index + 1] || null
        }))
      ];

      let type = RESULT.AUTHENTIC;
      if (terroir < 50) {
        type = RESULT.COMPROMISED;
      } else if (terroir < 80) {
        type = RESULT.CAUTION;
      }

      const firstUnverifiedIndex = handlerChain.findIndex((node, index) => index > 0 && !node.verified);
      const compromisedHandler = firstUnverifiedIndex >= 0 ? handlerChain[firstUnverifiedIndex] : null;

      setResultType(type);
      setResultData({
        hash: cleanHash,
        terroir,
        record,
        artisan,
        sbtId: String(sbtId),
        regionLabel: deriveRegionFromCoordinates(record.origin_lat, record.origin_lng),
        registrationTxHash: eventMeta.registrationTxHash,
        unverifiedCount,
        handlerChain,
        compromisedHandler,
        nonce: activeNonce,
        nonceUsed,
        metadataUrl,
        imageUrl,
        metadataHash: record.metadataHash,
        provenanceSigner: record.provenanceSigner,
        hasDeviceSignature: String(record.deviceSignature || "0x") !== "0x"
      });
      setStatus("Verification complete.");
    } catch (error) {
      const text = String(error?.shortMessage || error?.message || "").toLowerCase();
      if (text.includes("product not found") || text.includes("never been registered")) {
        setResultType(RESULT.NOT_FOUND);
        setResultData(null);
        setStatus("This product has never been registered on Pramaan.");
      } else {
        setResultType(RESULT.NONE);
        setResultData(null);
        setStatus(error?.shortMessage || error?.message || "Verification failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(event) {
    event.preventDefault();
    await runVerification(hash);
  }

  async function onCheckpointNonce() {
    if (!resultData?.hash || !resultData?.nonce) {
      setStatus("Verify a product first before checkpointing nonce.");
      return;
    }

    setCheckpointLoading(true);
    try {
      const result = await checkpointScanNonce(resultData.hash, resultData.nonce);
      const txHash = result?.receipt?.transactionHash || result?.receipt?.hash || "";
      const replayed = Boolean(result?.replayed);

      setResultData((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          nonceUsed: true,
          replayed,
          nonceTxUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : ""
        };
      });

      if (txHash) {
        appendEvidenceEntry({
          action: "Nonce Checkpoint",
          productHash: resultData.hash,
          txUrl: "https://sepolia.etherscan.io/tx/" + txHash,
          notes: replayed ? "Replay detected from verify page" : "Fresh nonce checkpoint from verify page"
        });
      }

      setStatus(replayed ? "Replay detected and recorded on-chain." : "Fresh scan nonce recorded on-chain.");
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Nonce checkpoint failed.");
    } finally {
      setCheckpointLoading(false);
    }
  }

  const resultHeader = useMemo(() => {
    if (!resultData) {
      return null;
    }

    if (resultType === RESULT.AUTHENTIC) {
      return {
        icon: "✓",
        title: "AUTHENTIC PRODUCT",
        color: "#16794d",
        bg: "#ddf9eb"
      };
    }

    if (resultType === RESULT.CAUTION) {
      return {
        icon: "!",
        title: "CAUTION — CHAIN OF CUSTODY WEAKENED",
        color: "#8a5b09",
        bg: "#fff1d1"
      };
    }

    if (resultType === RESULT.COMPROMISED) {
      return {
        icon: "✕",
        title: "COMPROMISED — AUTHENTICITY CANNOT BE GUARANTEED",
        color: "#8a1f1f",
        bg: "#ffe0e0"
      };
    }

    return null;
  }, [resultType, resultData]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Verify Product</h1>
        <p className="m-0 text-[#49665e]">Enter a product hash to verify authenticity and custody trail.</p>
      </div>

      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <form onSubmit={onVerify} className="grid gap-3">
            <Input
              suppressHydrationWarning
              required
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="0x..."
            />
            <Input
              suppressHydrationWarning
              value={scanNonce}
              onChange={(e) => setScanNonce(e.target.value)}
              placeholder="Scan nonce (optional bytes32; auto-generated if empty)"
            />
            <Button suppressHydrationWarning disabled={loading} type="submit" className="w-fit">
              {loading ? "Verifying..." : "Verify Product"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {status && <p className="m-0 text-[#355]">{status}</p>}

      {resultType === RESULT.NOT_FOUND && (
        <Card className="max-w-3xl border-[#e7d8d8] bg-[#fff7f7]">
          <CardContent className="pt-6">
            <p className="m-0 font-semibold text-[#8a1f1f]">
              This product has never been registered on Pramaan.
            </p>
          </CardContent>
        </Card>
      )}

      {resultData && resultHeader && (
        <>
          <Card className="max-w-4xl" style={{ background: resultHeader.bg, borderColor: resultHeader.color }}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 30,
                    fontWeight: 800,
                    color: "white",
                    background: resultHeader.color
                  }}
                >
                  {resultHeader.icon}
                </div>
                <h2 className="m-0 text-2xl font-bold" style={{ color: resultHeader.color }}>{resultHeader.title}</h2>
              </div>
            </CardContent>
          </Card>

          <div className="max-w-4xl">
            <TerritorScore score={resultData.terroir} />
          </div>

          {resultType === RESULT.CAUTION && (
            <Card className="max-w-4xl border-[#e3c89a] bg-[#fff8e8]">
              <CardContent className="pt-6">
                <p className="m-0 font-semibold text-[#8a5b09]">
                  {resultData.unverifiedCount} unverified handlers detected in supply chain.
                </p>
              </CardContent>
            </Card>
          )}

          {resultType === RESULT.COMPROMISED && (
            <Card className="max-w-4xl border-[#e1b5b5] bg-[#fff0f0]">
              <CardContent className="pt-6">
                <p className="m-0 font-semibold text-[#8a1f1f]">
                  {resultData.compromisedHandler
                    ? "Score dropped due to unverified handler: " + truncateAddress(resultData.compromisedHandler.wallet)
                    : "Score dropped due to unverified custody events."}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="max-w-4xl">
            <CardHeader className="pb-2">
              <CardTitle>Product Record</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Product</p>
                <p className="m-0 text-lg font-semibold text-[#20473d]">
                  {resultData.record.productName} ({resultData.record.giTag})
                </p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Artisan</p>
                <p className="m-0 text-base font-medium text-[#20473d]">{resultData.artisan?.name || "Unknown"}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Craft Type</p>
                <p className="m-0 text-base font-medium text-[#20473d]">{resultData.artisan?.craft || "Unknown"}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">SBT Token ID</p>
                <p className="m-0 text-base font-semibold text-[#20473d]">{resultData.sbtId}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Registered At</p>
                <p className="m-0 text-base font-medium text-[#20473d]">{formatDate(resultData.record.registeredAt)}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Origin GPS</p>
                <p className="m-0 text-base font-medium text-[#20473d]">
                  {resultData.regionLabel} ({(Number(resultData.record.origin_lat) / 1000000).toFixed(6)}, {(Number(resultData.record.origin_lng) / 1000000).toFixed(6)})
                </p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">IPFS Image</p>
                <a
                  href={resultData.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#176f52] no-underline"
                >
                  Open original image
                </a>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">IPFS Metadata</p>
                <a
                  href={resultData.metadataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#176f52] no-underline"
                >
                  Open attestation metadata
                </a>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Metadata Hash</p>
                <p className="m-0 break-all font-mono text-sm text-[#20473d]">{resultData.metadataHash || "-"}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Provenance Signer</p>
                <p className="m-0 break-all font-mono text-sm text-[#20473d]">{resultData.provenanceSigner || "-"}</p>
              </div>

              <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Device Signature</p>
                <p className="m-0 text-base font-medium text-[#20473d]">
                  {resultData.hasDeviceSignature ? "Present" : "Missing"}
                </p>
              </div>

              {resultData.registrationTxHash && (
                <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
                  <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Registration Tx</p>
                  <a
                    href={"https://sepolia.etherscan.io/tx/" + resultData.registrationTxHash}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#176f52] no-underline"
                  >
                    View on Etherscan
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="max-w-4xl">
            <CardHeader className="pb-2">
              <CardTitle>Nonce Replay Protection</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-[#355]">
              <p className="m-0">Nonce: <span className="break-all font-mono">{resultData.nonce}</span></p>
              <p className="m-0">Pre-check status: {resultData.nonceUsed ? "Already used (possible replay)" : "Not used yet"}</p>
              {typeof resultData.replayed === "boolean" && (
                <p className="m-0">Checkpoint result: {resultData.replayed ? "Replay detected" : "Fresh scan recorded"}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onCheckpointNonce} disabled={checkpointLoading}>
                  {checkpointLoading ? "Checkpointing..." : "Checkpoint Nonce On-Chain"}
                </Button>
                {resultData.nonceTxUrl && (
                  <a href={resultData.nonceTxUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#176f52] no-underline">
                    View nonce tx
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="max-w-4xl">
            <CardHeader className="pb-2">
              <CardTitle>Full Handler Chain</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {resultData.handlerChain.map((node, index) => (
                <div key={index} className="grid grid-cols-[24px_1fr] gap-3">
                  <div className="grid justify-items-center">
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: node.verified ? "#1d9e75" : "#c53d3d",
                        marginTop: 4
                      }}
                    />
                    {index < resultData.handlerChain.length - 1 && (
                      <div style={{ width: 2, height: 36, background: "#d5e6e0", marginTop: 2 }} />
                    )}
                  </div>
                  <div className="rounded-xl border border-[#dcebe5] bg-[#f8fcfb] p-3">
                    <div className="font-semibold text-[#284f46]">{node.label}</div>
                    <div className="font-mono text-[#466]">
                      {truncateAddress(node.wallet)}
                    </div>
                    <div className="text-[#577]">{node.timestamp ? formatDate(node.timestamp) : "Timestamp unavailable"}</div>
                    <div className="mt-1">
                      <Badge variant={node.verified ? "default" : "warm"}>{node.verified ? "Verified" : "Unverified"}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="max-w-4xl">
            <CardHeader className="pb-2">
              <CardTitle>Terroir Score Demo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-[#466]">
              <p className="m-0">
                Transfer this product through an unverified wallet to see the score drop.
              </p>
              <Link href={"/transfer?hash=" + resultData.hash} className="w-fit no-underline">
                <Button>Go to Transfer Demo</Button>
              </Link>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
