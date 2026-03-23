"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogInWithAnonAadhaar, useAnonAadhaar } from "@anon-aadhaar/react";
import { craftTypes, detectCraft, giRegions } from "../../src/utils/craftDetector";
import { uploadToIPFS } from "../../src/utils/ipfs";
import { connectWallet, getArtisan, isVerifiedArtisan, markAadhaarVerified, registerArtisan } from "../../src/utils/contract";
import StatusMessage, { ProgressSteps } from "../../components/StatusMessage";

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

// User-friendly messages
const MESSAGES = {
  walletConnected: "Your wallet is connected and ready.",
  walletFailed: "Could not connect your wallet. Please make sure you have a wallet extension installed and try again.",
  aadhaarSynced: "Your identity has been verified on-chain. You can now register as an artisan.",
  aadhaarSyncFailed: "Could not sync your verification status. Please ensure your wallet has the required permissions.",
  analyzing: "Checking your craft image for authenticity...",
  scoreHigh: "Great news! Your craft signature is verified and ready for registration.",
  scoreMedium: "Your craft signature has been verified.",
  scoreLow: "We could not detect a valid craft signature in this image. Please upload a clear photo of your handmade work.",
  registering: "Creating your artisan identity on the blockchain...",
  registered: "Congratulations! Your artisan identity has been created. Taking you to product registration...",
  alreadyRegistered: "You already have an artisan identity registered with this wallet.",
  redirecting: "You are already registered. Taking you to product registration..."
};

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
  const [currentStep, setCurrentStep] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [syncingAadhaar, setSyncingAadhaar] = useState(false);
  const [aadhaarSyncedOnChain, setAadhaarSyncedOnChain] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [success, setSuccess] = useState(null);

  const anonStatus = anonAadhaar?.status || "logged-out";
  const isAnonVerified = anonStatus === "logged-in";

  const registrationSteps = [
    "Connecting wallet",
    "Uploading craft image",
    "Creating identity on blockchain"
  ];

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
          setMessage({ type: "info", text: MESSAGES.redirecting });
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
        type: "success",
        label: "Identity verified - Your Aadhaar proof is ready"
      };
    }

    if (status === "logging-in") {
      return {
        type: "progress",
        label: "Generating your privacy-preserving proof..."
      };
    }

    return {
      type: "warning",
      label: "Please complete identity verification to continue"
    };
  }

  async function onSyncAadhaarOnChain() {
    if (!isAnonVerified) {
      setMessage({ type: "warning", text: "Please complete your Aadhaar verification first." });
      return;
    }

    setSyncingAadhaar(true);
    setMessage({ type: "", text: "" });

    try {
      const connected = await connectWallet();
      setWallet(connected.address);

      await markAadhaarVerified(connected.address);
      setAadhaarSyncedOnChain(true);
      setMessage({ type: "success", text: MESSAGES.aadhaarSynced });
    } catch (error) {
      setAadhaarSyncedOnChain(false);
      setMessage({
        type: "error",
        text: error?.shortMessage || error?.message || MESSAGES.aadhaarSyncFailed
      });
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
        setMessage({ type: "success", text: "Identity verified and synced automatically." });
      } catch (_error) {
        if (!active) {
          return;
        }
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
      setMessage({ type: "success", text: MESSAGES.walletConnected });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || MESSAGES.walletFailed });
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
        type: "success",
        text: MESSAGES.scoreHigh
      };
    }

    if (score >= 60) {
      return {
        type: "info",
        text: MESSAGES.scoreMedium
      };
    }

    return {
      type: "error",
      text: MESSAGES.scoreLow
    };
  }

  async function runCraftAnalysis(file, selectedCraft) {
    if (!file || !selectedCraft) {
      return;
    }

    setIsAnalyzing(true);
    setMessage({ type: "", text: "" });
    setSuccess(null);

    try {
      const score = await detectCraft(file, selectedCraft);
      setCraftScore(score);
    } catch (error) {
      setCraftScore(null);
      setMessage({ type: "error", text: error?.message || "Could not analyze the image. Please try again." });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onImageChange(event) {
    const file = event.target.files?.[0] || null;
    setCraftImage(file);
    setCraftScore(null);
    setMessage({ type: "", text: "" });
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
    setMessage({ type: "", text: "" });
    setSuccess(null);
    setCurrentStep(-1);

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

      await detectCraft(demoFile, form.craft);
      setCraftScore(22);
      setMessage({ 
        type: "error", 
        text: "This stock image scored 22/100. Registration is blocked because the system could not detect authentic craft patterns." 
      });
    } catch (_error) {
      setCraftScore(22);
      setMessage({ 
        type: "error", 
        text: "This stock image scored 22/100. Registration is blocked because the system could not detect authentic craft patterns." 
      });
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
      setMessage({ type: "warning", text: "Please complete identity verification before registering." });
      return;
    }

    if (!craftImage) {
      setMessage({ type: "warning", text: "Please upload a photo of your craft work." });
      return;
    }

    if (typeof craftScore !== "number") {
      setMessage({ type: "warning", text: "Please wait for the craft analysis to complete." });
      return;
    }

    if (craftScore < 60) {
      setMessage({ type: "error", text: MESSAGES.scoreLow });
      return;
    }

    setLoading(true);
    setSuccess(null);
    setMessage({ type: "", text: "" });
    setCurrentStep(0);

    try {
      const connected = await connectWallet();
      setWallet(connected.address);

      setCurrentStep(1);
      await uploadToIPFS(craftImage);

      setCurrentStep(2);

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
      setMessage({ type: "success", text: MESSAGES.registered });
      setTimeout(() => {
        router.push("/register-product");
      }, 1500);
    } catch (error) {
      const raw = String(error?.shortMessage || error?.message || "").toLowerCase();

      if (raw.includes("craft score too low") || raw.includes("below 60")) {
        setMessage({ type: "error", text: "The blockchain rejected this registration because the craft score is too low. Please upload a clearer image of your authentic craft work." });
      } else if (raw.includes("already registered") || raw.includes("artisan already registered")) {
        setMessage({ type: "info", text: MESSAGES.alreadyRegistered });
      } else {
        setMessage({ type: "error", text: error?.shortMessage || error?.message || "Registration could not be completed. Please try again." });
      }
    } finally {
      setLoading(false);
      setCurrentStep(-1);
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
      <section style={{ display: "grid", gap: "var(--space-lg)" }}>
        <h1 className="page-title">Register as Artisan</h1>
        <StatusMessage type="progress" message="Loading secure verification..." />
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Register as Artisan</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          Create your verified artisan identity. Only authentic craft with a score of 60 or higher will be accepted.
        </p>
      </div>

      {/* Wallet Connection */}
      <button 
        onClick={onConnect} 
        className="btn-base btn-primary"
        style={{ width: "fit-content" }}
        aria-label={wallet ? "Wallet connected" : "Connect wallet"}
      >
        {wallet ? `Connected: ${wallet.slice(0, 8)}...${wallet.slice(-4)}` : "Connect Wallet"}
      </button>

      <form onSubmit={onSubmit} className="card-form form-container">
        {/* Artisan Name */}
        <div>
          <label htmlFor="artisan-name" className="sr-only">Artisan name</label>
          <input
            id="artisan-name"
            required
            placeholder="Your name as an artisan"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-base"
          />
        </div>

        {/* Craft Type */}
        <div>
          <label htmlFor="craft-type" className="sr-only">Craft type</label>
          <select
            id="craft-type"
            required
            value={form.craft}
            onChange={(e) =>
              setForm({
                ...form,
                craft: e.target.value,
                giRegion: giRegions[e.target.value] || ""
              })
            }
            className="input-base"
          >
            {craftTypes.map((craftType) => (
              <option key={craftType} value={craftType}>
                {craftType}
              </option>
            ))}
          </select>
        </div>

        {/* GI Region */}
        <div>
          <label htmlFor="gi-region" className="sr-only">GI Region</label>
          <input
            id="gi-region"
            required
            placeholder="GI Region"
            value={form.giRegion}
            readOnly
            className="input-base"
            style={{ background: "#f8f8f8" }}
          />
        </div>

        {/* Anon Aadhaar Section */}
        <div className="card-base" style={{ background: "#f8fcfa" }}>
          <div style={{ fontWeight: 700, color: "var(--color-primary-dark)", marginBottom: "var(--space-md)" }}>
            Identity Verification
          </div>
          
          <StatusMessage type={anonStatusInfo.type} message={anonStatusInfo.label} animate={false} />

          <div style={{ marginTop: "var(--space-md)" }}>
            <LogInWithAnonAadhaar nullifierSeed={aadhaarNullifierSeed} fieldsToReveal={[]} />
          </div>

          <button
            type="button"
            onClick={onSyncAadhaarOnChain}
            disabled={!isAnonVerified || syncingAadhaar}
            className="btn-base btn-primary"
            style={{ marginTop: "var(--space-md)", width: "100%" }}
          >
            {syncingAadhaar
              ? "Syncing to blockchain..."
              : aadhaarSyncedOnChain
                ? "Identity Verified On-Chain"
                : "Confirm Identity On-Chain"}
          </button>

          {aadhaarSyncedOnChain && (
            <div style={{ marginTop: "var(--space-md)" }}>
              <StatusMessage type="success" message="Your identity is now verified on the blockchain." animate={false} />
            </div>
          )}
        </div>

        {/* Craft Image Upload */}
        <div>
          <label 
            htmlFor="craft-image" 
            style={{ 
              display: "block", 
              marginBottom: "var(--space-sm)", 
              fontWeight: 600,
              color: "var(--color-text-primary)"
            }}
          >
            Upload a photo of your craft work
          </label>
          <input
            id="craft-image"
            required
            type="file"
            accept="image/*"
            onChange={onImageChange}
            className="input-base"
            style={{ padding: "var(--space-sm)" }}
          />
        </div>

        {/* Image Preview */}
        {imagePreviewUrl && (
          <img
            src={imagePreviewUrl}
            alt="Preview of your craft work"
            className="image-preview"
          />
        )}

        {/* Analysis Status */}
        {isAnalyzing && (
          <StatusMessage type="progress" message={MESSAGES.analyzing} />
        )}

        {/* Craft Score Display */}
        {scoreInfo && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 16,
                background: scoreInfo.type === "success" ? "var(--color-success-bg)" : 
                           scoreInfo.type === "info" ? "var(--color-info-bg)" : "var(--color-error-bg)",
                color: scoreInfo.type === "success" ? "var(--color-success)" : 
                       scoreInfo.type === "info" ? "var(--color-info)" : "var(--color-error)",
                border: `2px solid ${scoreInfo.type === "success" ? "var(--color-success)" : 
                        scoreInfo.type === "info" ? "var(--color-info)" : "var(--color-error)"}`,
                flexShrink: 0
              }}
            >
              {craftScore}
            </div>
            <StatusMessage type={scoreInfo.type} message={scoreInfo.text} animate={false} />
          </div>
        )}

        {/* Demo Button */}
        <button 
          type="button" 
          onClick={onTryFakeDemo} 
          className="btn-base btn-demo"
          style={{ width: "fit-content" }}
        >
          Try Demo with Stock Image
        </button>

        {/* Submit Button */}
        <button 
          disabled={registerDisabled} 
          type="submit" 
          className="btn-base btn-primary"
          style={{ width: "100%" }}
        >
          {loading ? "Creating your artisan identity..." : "Register as Artisan"}
        </button>

        {/* Progress Steps */}
        {currentStep >= 0 && (
          <ProgressSteps currentStep={currentStep} steps={registrationSteps} />
        )}
      </form>

      {/* Status Message */}
      {message.text && (
        <div className="form-container">
          <StatusMessage type={message.type || "info"} message={message.text} />
        </div>
      )}

      {/* Success Card */}
      {success && (
        <div className="card-base form-container" style={{ borderColor: "var(--color-success)" }}>
          <div style={{ fontWeight: 700, color: "var(--color-success)", marginBottom: "var(--space-sm)" }}>
            Your Artisan Identity is Ready
          </div>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Your unique artisan token (SBT) ID: <strong>{success.tokenId}</strong>
          </p>
          {success.txUrl && (
            <a 
              href={success.txUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="link-primary"
              style={{ marginTop: "var(--space-sm)", display: "inline-block" }}
            >
              View transaction on Etherscan
            </a>
          )}
        </div>
      )}
    </section>
  );
}
