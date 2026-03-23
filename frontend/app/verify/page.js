"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import TerritorScore from "../../components/TerritorScore";
import StatusMessage from "../../components/StatusMessage";
import { getArtisan, getArtisanTokenId, verifyProduct } from "../../src/utils/contract";
import { getIPFSUrl } from "../../src/utils/ipfs";
import { PRODUCT_REGISTRY_ADDRESS, RPC_URL } from "../../src/utils/constants";

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

// User-friendly messages
const MESSAGES = {
  verifying: "Looking up this product on the blockchain...",
  notFound: "This product has not been registered on Pramaan. If you believe this is an error, please contact the seller.",
  authentic: "This product is verified authentic with a complete chain of custody.",
  caution: "This product is registered, but some handlers in the supply chain could not be verified.",
  compromised: "Warning: This product's authenticity cannot be guaranteed due to unverified custody events."
};

export default function VerifyPage() {
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [resultType, setResultType] = useState(RESULT.NONE);
  const [resultData, setResultData] = useState(null);
  const [autoVerified, setAutoVerified] = useState(false);

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
      setMessage({ type: "warning", text: "Please enter a product hash to verify." });
      return;
    }

    setLoading(true);
    setMessage({ type: "progress", text: MESSAGES.verifying });
    setResultType(RESULT.NONE);
    setResultData(null);

    try {
      const { record, terroir } = await verifyProduct(cleanHash);
      const artisan = await getArtisan(record.artisan);
      const sbtId = await getArtisanTokenId(record.artisan);
      const eventMeta = await fetchProductEventMetadata(cleanHash);

      const unverifiedCount = Array.isArray(record.handlerVerified)
        ? record.handlerVerified.filter((value) => !value).length
        : 0;

      const handlerChain = [
        {
          label: "Artisan (Creator)",
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
        compromisedHandler
      });
      
      // Set appropriate message based on result
      if (type === RESULT.AUTHENTIC) {
        setMessage({ type: "success", text: MESSAGES.authentic });
      } else if (type === RESULT.CAUTION) {
        setMessage({ type: "warning", text: MESSAGES.caution });
      } else {
        setMessage({ type: "error", text: MESSAGES.compromised });
      }
    } catch (error) {
      const text = String(error?.shortMessage || error?.message || "").toLowerCase();
      if (text.includes("product not found") || text.includes("never been registered")) {
        setResultType(RESULT.NOT_FOUND);
        setResultData(null);
        setMessage({ type: "error", text: MESSAGES.notFound });
      } else {
        setResultType(RESULT.NONE);
        setResultData(null);
        setMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not verify this product. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(event) {
    event.preventDefault();
    await runVerification(hash);
  }

  const resultHeader = useMemo(() => {
    if (!resultData) {
      return null;
    }

    if (resultType === RESULT.AUTHENTIC) {
      return {
        icon: "check",
        title: "Verified Authentic",
        subtitle: "This product has a complete chain of custody",
        color: "var(--color-success)",
        bg: "var(--color-success-bg)"
      };
    }

    if (resultType === RESULT.CAUTION) {
      return {
        icon: "warning",
        title: "Authenticity Unconfirmed",
        subtitle: "Some handlers in the supply chain could not be verified",
        color: "var(--color-warning)",
        bg: "var(--color-warning-bg)"
      };
    }

    if (resultType === RESULT.COMPROMISED) {
      return {
        icon: "x",
        title: "Cannot Verify Authenticity",
        subtitle: "The chain of custody has been broken",
        color: "var(--color-error)",
        bg: "var(--color-error-bg)"
      };
    }

    return null;
  }, [resultType, resultData]);

  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Verify Product</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          Check if a product is authentic and trace its complete history from the original artisan.
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={onVerify} className="card-form card-container">
        <div>
          <label htmlFor="product-hash" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
            Product Hash
          </label>
          <input
            id="product-hash"
            suppressHydrationWarning
            required
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="Enter the product hash (0x...)"
            className="input-base"
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </div>
        <button suppressHydrationWarning disabled={loading} type="submit" className="btn-base btn-primary" style={{ width: "fit-content" }}>
          {loading ? "Verifying..." : "Verify Product"}
        </button>
      </form>

      {/* Status Message */}
      {message.text && !resultData && (
        <div className="card-container">
          <StatusMessage type={message.type || "info"} message={message.text} />
        </div>
      )}

      {/* Not Found State */}
      {resultType === RESULT.NOT_FOUND && (
        <div className="card-base card-container" style={{ borderColor: "var(--color-error-border)", background: "var(--color-error-bg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--color-error)",
                color: "white",
                flexShrink: 0
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h2 style={{ margin: 0, color: "var(--color-error)", fontSize: "1.25rem" }}>Product Not Found</h2>
              <p style={{ margin: "var(--space-xs) 0 0", color: "var(--color-error)" }}>
                {MESSAGES.notFound}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {resultData && resultHeader && (
        <>
          {/* Result Header Card */}
          <div className="card-base card-container" style={{ background: resultHeader.bg, borderColor: resultHeader.color }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: resultHeader.color,
                  color: "white",
                  flexShrink: 0
                }}
              >
                {resultHeader.icon === "check" && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12L10 17L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {resultHeader.icon === "warning" && (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9V13M12 17H12.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                )}
                {resultHeader.icon === "x" && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
              <div>
                <h2 style={{ margin: 0, color: resultHeader.color, fontSize: "1.5rem" }}>{resultHeader.title}</h2>
                <p style={{ margin: "var(--space-xs) 0 0", color: resultHeader.color, opacity: 0.9 }}>
                  {resultHeader.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Terroir Score */}
          <div style={{ maxWidth: 420 }}>
            <TerritorScore score={resultData.terroir} />
          </div>

          {/* Warning Messages */}
          {resultType === RESULT.CAUTION && (
            <div className="card-container">
              <StatusMessage 
                type="warning" 
                title="Supply Chain Alert"
                message={`${resultData.unverifiedCount} handler${resultData.unverifiedCount > 1 ? 's' : ''} in the supply chain could not be verified. This may affect product authenticity.`}
              />
            </div>
          )}

          {resultType === RESULT.COMPROMISED && (
            <div className="card-container">
              <StatusMessage 
                type="error" 
                title="Authenticity Warning"
                message={resultData.compromisedHandler
                  ? `The chain of custody was broken at handler ${truncateAddress(resultData.compromisedHandler.wallet)}. This product's authenticity cannot be guaranteed.`
                  : "The chain of custody has been broken due to unverified custody events."}
              />
            </div>
          )}

          {/* Product Details Card */}
          <div className="card-base card-container">
            <h3 style={{ margin: "0 0 var(--space-md)", color: "var(--color-primary-dark)" }}>Product Details</h3>
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Product:</span>
                <span style={{ color: "var(--color-text-secondary)" }}>{resultData.record.productName} ({resultData.record.giTag})</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Artisan:</span>
                <span style={{ color: "var(--color-text-secondary)" }}>{resultData.artisan?.name || "Unknown"}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Craft Type:</span>
                <span style={{ color: "var(--color-text-secondary)" }}>{resultData.artisan?.craft || "Unknown"}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Artisan Token:</span>
                <span style={{ color: "var(--color-text-secondary)" }}>#{resultData.sbtId}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Registered:</span>
                <span style={{ color: "var(--color-text-secondary)" }}>{formatDate(resultData.record.registeredAt)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Origin:</span>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  {resultData.regionLabel} ({(Number(resultData.record.origin_lat) / 1000000).toFixed(6)}, {(Number(resultData.record.origin_lng) / 1000000).toFixed(6)})
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Original Image:</span>
                <a
                  href={getIPFSUrl(resultData.record.ipfsCid)}
                  target="_blank"
                  rel="noreferrer"
                  className="link-primary"
                >
                  View on IPFS
                </a>
              </div>
              {resultData.registrationTxHash && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-xs)", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "var(--color-text-primary)", minWidth: 120 }}>Transaction:</span>
                  <a
                    href={"https://sepolia.etherscan.io/tx/" + resultData.registrationTxHash}
                    target="_blank"
                    rel="noreferrer"
                    className="link-primary"
                  >
                    View on Etherscan
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Handler Chain Card */}
          <div className="card-base card-container">
            <h3 style={{ margin: "0 0 var(--space-lg)", color: "var(--color-primary-dark)" }}>Chain of Custody</h3>
            <div style={{ display: "grid", gap: "var(--space-md)" }}>
              {resultData.handlerChain.map((node, index) => (
                <div key={index} style={{ display: "flex", gap: "var(--space-md)" }}>
                  {/* Timeline indicator */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: node.verified ? "var(--color-success)" : "var(--color-error)",
                        flexShrink: 0
                      }}
                    />
                    {index < resultData.handlerChain.length - 1 && (
                      <div style={{ width: 2, flex: 1, background: "var(--color-border)", marginTop: 4 }} />
                    )}
                  </div>
                  
                  {/* Handler info */}
                  <div 
                    style={{ 
                      flex: 1,
                      background: node.verified ? "#f8fcfb" : "#fff8f8",
                      border: `1px solid ${node.verified ? "var(--color-border)" : "var(--color-error-border)"}`,
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--space-md)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--space-sm)" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--color-primary-dark)" }}>{node.label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                          {truncateAddress(node.wallet)}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>
                          {node.timestamp ? formatDate(node.timestamp) : "Timestamp unavailable"}
                        </div>
                      </div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          borderRadius: "var(--radius-full)",
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          background: node.verified ? "var(--color-success-bg)" : "var(--color-error-bg)",
                          color: node.verified ? "var(--color-success)" : "var(--color-error)",
                          border: `1px solid ${node.verified ? "var(--color-success-border)" : "var(--color-error-border)"}`
                        }}
                      >
                        {node.verified ? "Verified" : "Unverified"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions Card */}
          <div className="card-base card-container">
            <h3 style={{ margin: "0 0 var(--space-sm)", color: "var(--color-primary-dark)" }}>Try the Demo</h3>
            <p style={{ margin: "0 0 var(--space-md)", color: "var(--color-text-secondary)" }}>
              Transfer this product through an unverified wallet to see how the authenticity score changes.
            </p>
            <Link href={"/transfer?hash=" + resultData.hash} className="btn-base btn-primary" style={{ width: "fit-content" }}>
              Transfer This Product
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
