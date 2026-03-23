"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import TerritorScore from "../../components/TerritorScore";
import { getArtisan, getArtisanTokenId, verifyProduct } from "../../src/utils/contract";
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

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [resultType, setResultType] = useState(RESULT.NONE);
  const [resultData, setResultData] = useState(null);
  const [autoVerified, setAutoVerified] = useState(false);

  const hashFromUrl = searchParams.get("hash") || "";

  useEffect(() => {
    if (!hashFromUrl || autoVerified) {
      return;
    }

    setHash(hashFromUrl);
    setAutoVerified(true);
    runVerification(hashFromUrl);
  }, [hashFromUrl, autoVerified]);

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
        compromisedHandler
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
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Verify Product</h1>
      <p style={{ margin: 0, color: "#466" }}>Enter a product hash to verify authenticity and custody trail.</p>

      <form onSubmit={onVerify} style={formStyle}>
        <input
          required
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="0x..."
          style={inputStyle}
        />
        <button disabled={loading} type="submit" style={buttonStyle}>
          {loading ? "Verifying..." : "Verify Product"}
        </button>
      </form>

      {status && <p style={{ margin: 0, color: "#355" }}>{status}</p>}

      {resultType === RESULT.NOT_FOUND && (
        <div style={{ ...cardStyle, borderColor: "#e7d8d8", background: "#fff7f7" }}>
          <p style={{ margin: 0, color: "#8a1f1f", fontWeight: 700 }}>
            This product has never been registered on Pramaan.
          </p>
        </div>
      )}

      {resultData && resultHeader && (
        <>
          <div style={{ ...cardStyle, background: resultHeader.bg, borderColor: resultHeader.color }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              <h2 style={{ margin: 0, color: resultHeader.color }}>{resultHeader.title}</h2>
            </div>
          </div>

          <div style={{ maxWidth: 420 }}>
            <TerritorScore score={resultData.terroir} />
          </div>

          {resultType === RESULT.CAUTION && (
            <div style={{ ...cardStyle, background: "#fff8e8", borderColor: "#e3c89a" }}>
              <p style={{ margin: 0, color: "#8a5b09", fontWeight: 700 }}>
                {resultData.unverifiedCount} unverified handlers detected in supply chain.
              </p>
            </div>
          )}

          {resultType === RESULT.COMPROMISED && (
            <div style={{ ...cardStyle, background: "#fff0f0", borderColor: "#e1b5b5" }}>
              <p style={{ margin: 0, color: "#8a1f1f", fontWeight: 700 }}>
                {resultData.compromisedHandler
                  ? "Score dropped due to unverified handler: " + truncateAddress(resultData.compromisedHandler.wallet)
                  : "Score dropped due to unverified custody events."}
              </p>
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Product Record</h3>
            <p style={textStyle}>
              Product: {resultData.record.productName} ({resultData.record.giTag})
            </p>
            <p style={textStyle}>Artisan: {resultData.artisan?.name || "Unknown"}</p>
            <p style={textStyle}>Craft Type: {resultData.artisan?.craft || "Unknown"}</p>
            <p style={textStyle}>SBT Token ID: {resultData.sbtId}</p>
            <p style={textStyle}>Registered: {formatDate(resultData.record.registeredAt)}</p>
            <p style={textStyle}>
              Origin GPS: {resultData.regionLabel} ({(Number(resultData.record.origin_lat) / 1000000).toFixed(6)},
              {(Number(resultData.record.origin_lng) / 1000000).toFixed(6)})
            </p>
            <p style={textStyle}>
              IPFS Image:{" "}
              <a
                href={"https://" + resultData.record.ipfsCid + ".ipfs.w3s.link"}
                target="_blank"
                rel="noreferrer"
                style={linkStyle}
              >
                Open original image
              </a>
            </p>
            {resultData.registrationTxHash && (
              <p style={textStyle}>
                Registration Tx:{" "}
                <a
                  href={"https://sepolia.etherscan.io/tx/" + resultData.registrationTxHash}
                  target="_blank"
                  rel="noreferrer"
                  style={linkStyle}
                >
                  View on Etherscan
                </a>
              </p>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Full Handler Chain</h3>
            <div style={{ display: "grid", gap: 12 }}>
              {resultData.handlerChain.map((node, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 10 }}>
                  <div style={{ display: "grid", justifyItems: "center" }}>
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
                  <div style={{ background: "#f8fcfb", border: "1px solid #dcebe5", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 700, color: "#284f46" }}>{node.label}</div>
                    <div style={{ color: "#466", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {truncateAddress(node.wallet)}
                    </div>
                    <div style={{ color: "#577" }}>{node.timestamp ? formatDate(node.timestamp) : "Timestamp unavailable"}</div>
                    <div
                      style={{
                        marginTop: 4,
                        display: "inline-block",
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 12,
                        fontWeight: 700,
                        background: node.verified ? "#def4e9" : "#ffe2e2",
                        color: node.verified ? "#1a6f50" : "#8a1f1f",
                        border: "1px solid " + (node.verified ? "#9ed7bf" : "#e5b0b0")
                      }}
                    >
                      {node.verified ? "Verified" : "Unverified"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Terroir Score Demo</h3>
            <p style={{ margin: 0, color: "#466" }}>
              Transfer this product through an unverified wallet to see the score drop.
            </p>
            <Link href={"/transfer?hash=" + resultData.hash} style={linkButtonStyle}>
              Go to Transfer Demo
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

const formStyle = {
  display: "grid",
  gap: 10,
  maxWidth: 680,
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 14
};

const inputStyle = {
  border: "1px solid #cfe2db",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14
};

const buttonStyle = {
  background: "#1D9E75",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content"
};

const textStyle = { margin: "4px 0", color: "#355" };

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 14,
  maxWidth: 760
};

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};

const linkButtonStyle = {
  marginTop: 10,
  background: "#1D9E75",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content",
  textDecoration: "none",
  display: "inline-block"
};
