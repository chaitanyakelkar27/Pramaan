"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TerritorScore from "../../components/TerritorScore";
import StatusMessage, { ProgressSteps } from "../../components/StatusMessage";
import { giRegions } from "../../src/utils/craftDetector";
import { getArtisan, getArtisanTokenId, connectWallet, isVerifiedArtisan, registerProduct } from "../../src/utils/contract";
import { hashProduct } from "../../src/utils/hash";
import { getIPFSUrl, uploadToIPFS } from "../../src/utils/ipfs";

// User-friendly messages
const MESSAGES = {
  checking: "Verifying your artisan credentials...",
  notVerified: "You need to complete artisan registration before registering products.",
  partialVerified: "Your artisan identity was found, but verification is incomplete. Please finish setting up your identity first.",
  hashingImage: "Creating a unique fingerprint for your product image...",
  uploading: "Uploading your product image to permanent storage...",
  registering: "Recording your product on the blockchain...",
  success: "Your product has been registered successfully! You can now share the verification link with buyers.",
  alreadyRegistered: "This product image has already been registered. Taking you to the verification page...",
  walletError: "Could not connect to your wallet. Please make sure you have a wallet extension installed."
};

export default function RegisterProductPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [walletAddress, setWalletAddress] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [artisan, setArtisan] = useState(null);
  const [tokenId, setTokenId] = useState("-");

  const [form, setForm] = useState({
    name: "",
    giTag: "",
    lat: "",
    lng: "",
    batchSize: ""
  });

  const [productImage, setProductImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [productHash, setProductHash] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [currentStep, setCurrentStep] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const registrationSteps = [
    "Creating product fingerprint",
    "Uploading to permanent storage",
    "Recording on blockchain"
  ];

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const wallet = await connectWallet();
        const address = wallet.address;

        if (!mounted) {
          return;
        }

        setWalletAddress(address);

        const artisanRecord = await getArtisan(address);
        const verified = Boolean(await isVerifiedArtisan(address));
        const hasRegistration = Number(artisanRecord?.registeredAt || 0) > 0;

        if (!mounted) {
          return;
        }

        setIsVerified(verified);
        setArtisan(artisanRecord);

        if (!verified) {
          if (hasRegistration) {
            setMessage({ type: "warning", text: MESSAGES.partialVerified });
          } else {
            setMessage({ type: "warning", text: MESSAGES.notVerified });
          }

          try {
            const id = await getArtisanTokenId(address);
            if (mounted) {
              setTokenId(String(id));
            }
          } catch (_idError) {
            if (mounted) {
              setTokenId("Unknown");
            }
          }
          return;
        }

        setForm((prev) => ({
          ...prev,
          giTag: String(artisanRecord.craft || "")
        }));

        try {
          const id = await getArtisanTokenId(address);
          if (mounted) {
            setTokenId(String(id));
          }
        } catch (_idError) {
          if (mounted) {
            setTokenId("Unknown");
          }
        }
      } catch (error) {
        if (mounted) {
          setMessage({ type: "error", text: error?.message || MESSAGES.walletError });
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  async function onImageChange(event) {
    const file = event.target.files?.[0] || null;
    setProductImage(file);
    setProductHash("");
    setSuccess(null);

    if (!file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl("");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(URL.createObjectURL(file));
    setMessage({ type: "progress", text: MESSAGES.hashingImage });

    try {
      const hash = await hashProduct(file);
      setProductHash(hash);
      setMessage({ type: "success", text: "Product fingerprint created successfully." });
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "Could not create product fingerprint. Please try a different image." });
    }
  }

  function getTruncatedHash(hash) {
    if (!hash || hash.length < 20) {
      return hash;
    }
    return hash.slice(0, 10) + "..." + hash.slice(-6);
  }

  function isAlreadyRegisteredError(error) {
    const text = String(error?.shortMessage || error?.message || "").toLowerCase();
    return text.includes("product already registered");
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (!productImage) {
      setMessage({ type: "warning", text: "Please upload an image of your product." });
      return;
    }

    if (!productHash) {
      setMessage({ type: "warning", text: "Please wait for the product fingerprint to be created." });
      return;
    }

    setLoading(true);
    setMessage({ type: "", text: "" });
    setSuccess(null);
    setCurrentStep(0);

    try {
      setCurrentStep(1);
      const cid = await uploadToIPFS(productImage);

      setCurrentStep(2);

      const latScaled = Math.round(Number(form.lat) * 1000000);
      const lngScaled = Math.round(Number(form.lng) * 1000000);

      const receipt = await registerProduct(
        productHash,
        cid,
        form.name.trim(),
        form.giTag.trim(),
        latScaled,
        lngScaled
      );

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      const ipfsUrl = getIPFSUrl(cid);
      const verifyUrl = "/verify?hash=" + productHash;
      const transferUrl = "/transfer?hash=" + productHash;

      setSuccess({
        productHash,
        ipfsUrl,
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        verifyUrl,
        transferUrl
      });

      setMessage({ type: "success", text: MESSAGES.success });
    } catch (error) {
      if (isAlreadyRegisteredError(error)) {
        const verifyUrl = "/verify?hash=" + productHash;
        setMessage({ type: "info", text: MESSAGES.alreadyRegistered });
        setTimeout(() => router.push(verifyUrl), 1500);
      } else {
        setMessage({ type: "error", text: error?.shortMessage || error?.message || "Could not register your product. Please try again." });
      }
    } finally {
      setLoading(false);
      setCurrentStep(-1);
    }
  }

  if (checking) {
    return (
      <section style={{ display: "grid", gap: "var(--space-lg)" }}>
        <h1 className="page-title">Register Product</h1>
        <StatusMessage type="progress" message={MESSAGES.checking} />
      </section>
    );
  }

  if (!isVerified) {
    return (
      <section style={{ display: "grid", gap: "var(--space-lg)" }}>
        <div>
          <h1 className="page-title">Register Product</h1>
          <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
            Complete your artisan setup to start registering products.
          </p>
        </div>

        <StatusMessage 
          type="warning" 
          message={message.text || MESSAGES.notVerified}
          title="Action Required"
        />

        <div className="card-base form-container">
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Wallet:</strong> {walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}` : "Not connected"}
          </p>
          <p style={{ margin: "var(--space-sm) 0 0", color: "var(--color-text-secondary)" }}>
            <strong>Artisan Token ID:</strong> {tokenId}
          </p>
        </div>

        <Link href="/artisan" className="btn-base btn-primary" style={{ width: "fit-content" }}>
          Complete Artisan Registration
        </Link>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Register Product</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          Create a permanent record of your product on the blockchain. This proves its authenticity forever.
        </p>
      </div>

      {/* Verified Artisan Info Card */}
      <div className="card-base card-container">
        <h3 style={{ margin: "0 0 var(--space-md)", color: "var(--color-primary-dark)" }}>Your Artisan Profile</h3>
        <div style={{ display: "grid", gap: "var(--space-xs)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Wallet:</strong> {walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}` : "-"}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Name:</strong> {artisan?.name || "-"}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Craft:</strong> {artisan?.craft || "-"}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>GI Region:</strong> {artisan?.giRegion || giRegions[String(artisan?.craft || "")] || "-"}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Identity Verified:</strong> {artisan?.isAadhaarVerified ? "Yes" : "No"}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Artisan Token:</strong> #{tokenId}
          </p>
        </div>
      </div>

      {/* Registration Form */}
      <form onSubmit={onSubmit} className="card-form form-container">
        <div>
          <label htmlFor="product-name" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
            Product Name
          </label>
          <input
            id="product-name"
            required
            placeholder="e.g., First Flush Darjeeling 2024"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-base"
          />
        </div>

        <div>
          <label htmlFor="gi-tag" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
            GI Tag (from your profile)
          </label>
          <input
            id="gi-tag"
            required
            placeholder="GI Tag"
            value={form.giTag}
            readOnly
            className="input-base"
            style={{ background: "#f8f8f8" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
          <div>
            <label htmlFor="latitude" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
              Latitude
            </label>
            <input
              id="latitude"
              required
              type="number"
              step="any"
              placeholder="e.g., 26.8467"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
              className="input-base"
            />
          </div>
          <div>
            <label htmlFor="longitude" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
              Longitude
            </label>
            <input
              id="longitude"
              required
              type="number"
              step="any"
              placeholder="e.g., 80.9462"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
              className="input-base"
            />
          </div>
        </div>

        <div>
          <label htmlFor="batch-size" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
            Batch Size (optional)
          </label>
          <input
            id="batch-size"
            type="number"
            placeholder="Number of items in this batch"
            value={form.batchSize}
            onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
            className="input-base"
          />
        </div>

        <div>
          <label htmlFor="product-image" style={{ display: "block", marginBottom: "var(--space-xs)", fontWeight: 600 }}>
            Product Image
          </label>
          <input 
            id="product-image"
            type="file" 
            accept="image/*" 
            required 
            onChange={onImageChange} 
            className="input-base"
            style={{ padding: "var(--space-sm)" }}
          />
          <p style={{ margin: "var(--space-xs) 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
            This image will be permanently stored and used to verify your product.
          </p>
        </div>

        {/* Image Preview */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Preview of your product"
            className="image-preview"
          />
        )}

        {/* Product Hash Display */}
        {productHash && (
          <div className="card-base" style={{ background: "var(--color-info-bg)" }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>Product Fingerprint</p>
            <p style={{ margin: "var(--space-xs) 0 0", fontFamily: "var(--font-mono)", color: "var(--color-info)", wordBreak: "break-all" }}>
              {getTruncatedHash(productHash)}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <button type="submit" disabled={loading} className="btn-base btn-primary" style={{ width: "100%" }}>
          {loading ? "Registering your product..." : "Register Product"}
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
        <div className="card-base card-container" style={{ borderColor: "var(--color-success)" }}>
          <h3 style={{ margin: "0 0 var(--space-md)", color: "var(--color-success)" }}>Product Registered Successfully</h3>
          
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              <strong>Product Fingerprint:</strong>
            </p>
            <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 13, wordBreak: "break-all", color: "var(--color-text-muted)" }}>
              {success.productHash}
            </p>
            
            <p style={{ margin: "var(--space-sm) 0 0", color: "var(--color-text-secondary)" }}>
              <strong>Permanent Image:</strong>{" "}
              <a href={success.ipfsUrl} target="_blank" rel="noreferrer" className="link-primary">
                View on IPFS
              </a>
            </p>
            
            {success.txUrl && (
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                <strong>Transaction:</strong>{" "}
                <a href={success.txUrl} target="_blank" rel="noreferrer" className="link-primary">
                  View on Etherscan
                </a>
              </p>
            )}
          </div>

          <div style={{ marginTop: "var(--space-lg)", maxWidth: 340 }}>
            <TerritorScore score={100} />
          </div>

          <div style={{ marginTop: "var(--space-lg)", display: "flex", flexWrap: "wrap", gap: "var(--space-md)" }}>
            <Link href={success.verifyUrl} className="btn-base btn-secondary">
              View Verification Page
            </Link>
            <Link href={success.transferUrl} className="btn-base btn-primary">
              Transfer Ownership
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
