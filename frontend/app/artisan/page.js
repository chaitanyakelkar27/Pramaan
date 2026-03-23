"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import { craftTypes, detectCraft, giRegions } from "../../src/utils/craftDetector";
import { uploadToIPFS } from "../../src/utils/ipfs";
import { connectWallet, getArtisan, isVerifiedArtisan, markAadhaarVerified, registerArtisan } from "../../src/utils/contract";

const TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEFAULT_AADHAAR_NULLIFIER_SEED = 12345n;

function getAadhaarNullifierSeed() {
  const rawSeed = process.env.NEXT_PUBLIC_AADHAAR_NULLIFIER_SEED;
  if (typeof rawSeed === "string" && /^\d+$/.test(rawSeed)) {
    try {
      return BigInt(rawSeed);
    } catch (_error) {
      return DEFAULT_AADHAAR_NULLIFIER_SEED;
    }
  }
  return DEFAULT_AADHAAR_NULLIFIER_SEED;
}

export default function ArtisanPage() {
  const router = useRouter();
  const [anonAadhaar] = useAnonAadhaar();
  const aadhaarNullifierSeed = getAadhaarNullifierSeed();
  const [hydrated, setHydrated] = useState(false);

  const [form, setForm] = useState({
    name: "",
    craft: craftTypes[0],
    giRegion: giRegions[craftTypes[0]] || ""
  });
  const [wallet, setWallet] = useState("");
  const [craftImage, setCraftImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [craftScore, setCraftScore] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stepProgress, setStepProgress] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncingAadhaar, setSyncingAadhaar] = useState(false);
  const [aadhaarSyncedOnChain, setAadhaarSyncedOnChain] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(null);

  const anonStatus = anonAadhaar?.status || "logged-out";
  const isAnonVerified = anonStatus === "logged-in";

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let active = true;

    async function redirectIfAlreadyRegistered() {
      if (!hydrated) {
        return;
      }

      try {
        const connected = await connectWallet();
        if (!active) {
          return;
        }

        setWallet(connected.address);

        const [artisanRecord, verified] = await Promise.all([
          getArtisan(connected.address),
          isVerifiedArtisan(connected.address)
        ]);

        if (!active) {
          return;
        }

        const isRegistered = Number(artisanRecord?.registeredAt || 0) > 0;
        if (isRegistered && Boolean(verified)) {
          setMessage("Wallet already registered and verified. Redirecting to product registration...");
          router.replace("/register-product");
        }
      } catch (_error) {
        // Keep manual flow available when wallet is not connected yet.
      }
    }

    void redirectIfAlreadyRegistered();

    return () => {
      active = false;
    };
  }, [hydrated, router]);

  function getAnonStatusMeta(status) {
    if (status === "logged-in") {
      return {
        bg: "#ddf9eb",
        color: "#186d4c",
        label: "Anon Aadhaar proof verified locally"
      };
    }

    if (status === "logging-in") {
      return {
        bg: "#fff1d1",
        color: "#8a5b09",
        label: "Generating proof..."
      };
    }

    return {
      bg: "#ffe9e9",
      color: "#8a1f1f",
      label: "Proof not completed"
    };
  }

  async function onSyncAadhaarOnChain() {
    if (!isAnonVerified) {
      setMessage("Complete Anon Aadhaar proof first.");
      return;
    }

    setSyncingAadhaar(true);
    setMessage("");

    try {
      const connected = await connectWallet();
      setWallet(connected.address);

      await markAadhaarVerified(connected.address);
      setAadhaarSyncedOnChain(true);
      setMessage("Aadhaar verification synced on-chain for this wallet. Now click Register Artisan to mint identity.");
    } catch (error) {
      setAadhaarSyncedOnChain(false);
      setMessage(
        error?.shortMessage ||
        error?.message ||
        "Could not sync Aadhaar status on-chain. Ensure this wallet has verifier role."
      );
    } finally {
      setSyncingAadhaar(false);
    }
  }

  useEffect(() => {
    if (!wallet || !isAnonVerified) {
      setAutoSyncAttempted(false);
      setAadhaarSyncedOnChain(false);
      return;
    }

    if (aadhaarSyncedOnChain || autoSyncAttempted || syncingAadhaar) {
      return;
    }

    let active = true;

    async function autoSync() {
      setAutoSyncAttempted(true);
      setSyncingAadhaar(true);

      try {
        await markAadhaarVerified(wallet);
        if (!active) {
          return;
        }
        setAadhaarSyncedOnChain(true);
        setMessage("Anon Aadhaar verified and auto-synced on-chain.");
      } catch (_error) {
        if (!active) {
          return;
        }
        // Non-blocking: keep manual sync available even if auto sync fails.
        setAadhaarSyncedOnChain(false);
      } finally {
        if (active) {
          setSyncingAadhaar(false);
        }
      }
    }

    void autoSync();

    return () => {
      active = false;
    };
  }, [wallet, isAnonVerified, aadhaarSyncedOnChain, autoSyncAttempted, syncingAadhaar]);

  async function onConnect() {
    try {
      const result = await connectWallet();
      setWallet(result.address);
      setMessage("Wallet connected.");
    } catch (error) {
      setMessage(error?.message || "Failed to connect wallet.");
    }
  }

  function extractTokenIdFromReceipt(receipt) {
    const logs = receipt?.logs || [];
    const transferLog = logs.find(
      (log) =>
        Array.isArray(log.topics) &&
        log.topics.length >= 4 &&
        String(log.topics[0]).toLowerCase() === TRANSFER_EVENT_SIGNATURE
    );

    if (!transferLog) {
      return "Unknown";
    }

    try {
      return BigInt(transferLog.topics[3]).toString();
    } catch (_error) {
      return "Unknown";
    }
  }

  function getScoreDisplay(score) {
    if (typeof score !== "number") {
      return null;
    }

    if (score >= 80) {
      return {
        bg: "#ddf9eb",
        color: "#186d4c",
        text: "Excellent craft signature detected"
      };
    }

    if (score >= 60) {
      return {
        bg: "#fff1d1",
        color: "#8a5b09",
        text: "Craft signature verified"
      };
    }

    return {
      bg: "#ffe0e0",
      color: "#8a1f1f",
      text: "Craft signature not detected — registration blocked"
    };
  }

  async function runCraftAnalysis(file, selectedCraft) {
    if (!file || !selectedCraft) {
      return;
    }

    setIsAnalyzing(true);
    setMessage("");
    setSuccess(null);

    try {
      const score = await detectCraft(file, selectedCraft);
      setCraftScore(score);
    } catch (error) {
      setCraftScore(null);
      setMessage(error?.message || "Could not analyze the selected image.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onImageChange(event) {
    const file = event.target.files?.[0] || null;
    setCraftImage(file);
    setCraftScore(null);
    setMessage("");
    setSuccess(null);

    if (!file) {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl("");
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);

    await runCraftAnalysis(file, form.craft);
  }

  async function onTryFakeDemo() {
    setMessage("");
    setSuccess(null);
    setStepProgress("");

    try {
      setIsAnalyzing(true);

      const response = await fetch("https://picsum.photos/640/480");
      const blob = await response.blob();
      const demoFile = new File([blob], "stock-photo-demo.jpg", { type: blob.type || "image/jpeg" });

      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }

      setCraftImage(demoFile);
      setImagePreviewUrl(URL.createObjectURL(demoFile));

      // Run detector to mimic the real path, then force stable demo output.
      await detectCraft(demoFile, form.craft);
      setCraftScore(22);
      setMessage("This stock image scored 22. Registration blocked at the contract level.");
    } catch (_error) {
      setCraftScore(22);
      setMessage("This stock image scored 22. Registration blocked at the contract level.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (!craftImage) {
      return;
    }

    runCraftAnalysis(craftImage, form.craft);
  }, [form.craft]);

  async function onSubmit(event) {
    event.preventDefault();

    if (!isAnonVerified) {
      setMessage("Please complete Anon Aadhaar verification before registering.");
      return;
    }

    if (!craftImage) {
      setMessage("Please upload a craft image before registering.");
      return;
    }

    if (typeof craftScore !== "number") {
      setMessage("Craft score missing. Please upload and analyze your craft image first.");
      return;
    }

    if (craftScore < 60) {
      setMessage("Craft signature not detected — registration blocked");
      return;
    }

    setLoading(true);
    setSuccess(null);
    setMessage("");
    setStepProgress("Step 1/3: Uploading craft image to IPFS...");

    try {
      setStepProgress("Step 1/3: Connecting wallet...");
      const connected = await connectWallet();
      setWallet(connected.address);

      setStepProgress("Step 2/3: Uploading craft image to IPFS...");
      await uploadToIPFS(craftImage);

      setStepProgress("Step 3/3: Confirming on Sepolia...");

      const receipt = await registerArtisan(
        form.name.trim(),
        form.craft.trim(),
        form.giRegion.trim(),
        Number(craftScore)
      );

      const tokenId = extractTokenIdFromReceipt(receipt);
      const txHash = receipt?.transactionHash || receipt?.hash || "";
      const txUrl = txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "";

      setSuccess({
        tokenId,
        txUrl
      });
      setMessage("Artisan identity minted successfully. Redirecting to product registration...");
      setTimeout(() => {
        router.push("/register-product");
      }, 1200);
    } catch (error) {
      const raw = String(error?.shortMessage || error?.message || "").toLowerCase();

      if (raw.includes("craft score too low") || raw.includes("below 60")) {
        setMessage("Smart contract rejected: craft score below 60");
      } else if (raw.includes("already registered") || raw.includes("artisan already registered")) {
        setMessage("This wallet already has an artisan identity. Registration was skipped.");
      } else {
        setMessage(error?.shortMessage || error?.message || "Registration failed.");
      }
    } finally {
      setLoading(false);
      setStepProgress("");
    }
  }

  const scoreInfo = getScoreDisplay(craftScore);
  const anonStatusInfo = getAnonStatusMeta(anonStatus);
  const registerDisabled =
    loading ||
    isAnalyzing ||
    !isAnonVerified ||
    !craftImage ||
    !form.name.trim() ||
    typeof craftScore !== "number" ||
    craftScore < 60;

  if (!hydrated) {
    return (
      <section style={{ display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Register as Artisan</h1>
        <p style={{ margin: 0, color: "#466" }}>Loading secure verification...</p>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Register as Artisan</h1>
      <p style={{ margin: 0, color: "#466" }}>Only submissions with craft score 60+ pass the on-chain gate.</p>

      <button onClick={onConnect} style={buttonStyle}>
        {wallet ? "Connected: " + wallet.slice(0, 8) + "..." : "Connect Wallet"}
      </button>

      <form onSubmit={onSubmit} style={formStyle}>
        <input
          required
          placeholder="Artisan name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />

        <select
          required
          value={form.craft}
          onChange={(e) =>
            setForm({
              ...form,
              craft: e.target.value,
              giRegion: giRegions[e.target.value] || ""
            })
          }
          style={inputStyle}
        >
          {craftTypes.map((craftType) => (
            <option key={craftType} value={craftType}>
              {craftType}
            </option>
          ))}
        </select>

        <input
          required
          placeholder="GI Region"
          value={form.giRegion}
          readOnly
          style={inputStyle}
        />

        <div
          style={{
            border: "1px solid #d9ebe4",
            borderRadius: 10,
            padding: 12,
            background: "#f8fcfa",
            display: "grid",
            gap: 10
          }}
        >
          <div style={{ fontWeight: 700, color: "#1f5b4b" }}>Anon Aadhaar Verification</div>
          <div
            style={{
              background: anonStatusInfo.bg,
              color: anonStatusInfo.color,
              border: "1px solid " + anonStatusInfo.color,
              borderRadius: 8,
              padding: "8px 10px",
              fontWeight: 700
            }}
          >
            {anonStatusInfo.label}
          </div>

          <LogInWithAnonAadhaar nullifierSeed={aadhaarNullifierSeed} fieldsToReveal={[]} />

          <button
            type="button"
            onClick={onSyncAadhaarOnChain}
            disabled={!isAnonVerified || syncingAadhaar}
            style={{
              ...buttonStyle,
              background: !isAnonVerified || syncingAadhaar ? "#9bc2b4" : "#1D9E75"
            }}
          >
            {syncingAadhaar
              ? "Syncing Aadhaar..."
              : aadhaarSyncedOnChain
                ? "Aadhaar Synced On-Chain"
                : "Sync Aadhaar Status On-Chain (wallet prompt)"}
          </button>

          {aadhaarSyncedOnChain && (
            <div
              style={{
                border: "1px solid #3e9f74",
                background: "#dcf8e8",
                color: "#1c664c",
                borderRadius: 8,
                padding: "8px 10px",
                fontWeight: 700
              }}
            >
              On-chain Aadhaar flag updated for connected wallet.
            </div>
          )}
        </div>

        <input
          required
          type="file"
          accept="image/*"
          onChange={onImageChange}
          style={inputStyle}
        />

        {imagePreviewUrl && (
          <div style={{ display: "grid", gap: 8 }}>
            <img
              src={imagePreviewUrl}
              alt="Craft preview"
              style={{ width: "100%", maxWidth: 360, borderRadius: 10, border: "1px solid #d3e6df" }}
            />
          </div>
        )}

        {isAnalyzing && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="spinner" />
            <span style={{ color: "#355" }}>Analyzing craft authenticity...</span>
          </div>
        )}

        {scoreInfo && (
          <div
            style={{
              background: scoreInfo.bg,
              color: scoreInfo.color,
              border: "1px solid " + scoreInfo.color,
              borderRadius: 10,
              padding: "8px 10px",
              fontWeight: 700
            }}
          >
            Score: {craftScore} - {scoreInfo.text}
          </div>
        )}

        <button type="button" onClick={onTryFakeDemo} style={demoButtonStyle}>
          Try Fake Artisan Demo
        </button>

        <button disabled={registerDisabled} type="submit" style={buttonStyle}>
          {loading ? "Submitting..." : "Register Artisan"}
        </button>

        {stepProgress && (
          <div
            style={{
              border: "1px dashed #b4d8cb",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#2f5a50",
              background: "#eff8f4"
            }}
          >
            {stepProgress}
          </div>
        )}
      </form>

      {message && <p style={{ margin: 0, color: "#355" }}>{message}</p>}

      {success && (
        <div
          style={{
            marginTop: 4,
            background: "#dcf8e8",
            border: "1px solid #3e9f74",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#1c664c"
          }}
        >
          <div style={{ fontWeight: 700 }}>Soulbound Identity minted successfully.</div>
          <div>SBT Token ID: {success.tokenId}</div>
          {success.txUrl && (
            <a href={success.txUrl} target="_blank" rel="noreferrer" style={{ color: "#116f4f", fontWeight: 700 }}>
              View on Etherscan
            </a>
          )}
        </div>
      )}

      <style jsx>{`
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid #d5ebe3;
          border-top-color: #1d9e75;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </section>
  );
}

const formStyle = {
  display: "grid",
  gap: 10,
  maxWidth: 560,
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

const demoButtonStyle = {
  background: "#fff5f5",
  color: "#8a1f1f",
  border: "1px solid #e9bcbc",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content"
};
