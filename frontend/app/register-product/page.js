"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import TerritorScore from "../../components/TerritorScore";
import { giRegions } from "../../src/utils/craftDetector";
import { getArtisan, getArtisanTokenId, connectWallet, registerProduct } from "../../src/utils/contract";
import { hashProduct } from "../../src/utils/hash";
import { getIPFSUrl, uploadToIPFS } from "../../src/utils/ipfs";

export default function RegisterProductPage() {
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
  const [statusText, setStatusText] = useState("");
  const [stepProgress, setStepProgress] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

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
        const verified = Boolean(artisanRecord?.verified);

        if (!mounted) {
          return;
        }

        setIsVerified(verified);

        if (!verified) {
          setStatusText("You must register as an artisan before registering products.");
          return;
        }

        setArtisan(artisanRecord);
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
          setStatusText(error?.message || "Could not connect wallet.");
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

  function getCraftScoreBadge(score) {
    const value = Number(score || 0);
    if (value >= 80) {
      return { bg: "#ddf9eb", color: "#186d4c" };
    }
    if (value >= 60) {
      return { bg: "#fff1d1", color: "#8a5b09" };
    }
    return { bg: "#ffe0e0", color: "#8a1f1f" };
  }

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

    try {
      const hash = await hashProduct(file);
      setProductHash(hash);
    } catch (error) {
      setStatusText(error?.message || "Could not hash selected file.");
    }
  }

  function getTruncatedHash(hash) {
    if (!hash || hash.length < 20) {
      return hash;
    }
    return hash.slice(0, 10) + "..." + hash.slice(-6);
  }

  function openCertificate(successData) {
    if (!successData) {
      return;
    }

    const escapedProductName = String(successData.productName || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedArtisanName = String(successData.artisanName || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedGiTag = String(successData.giTag || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedDate = String(successData.registrationDate || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Pramaan Product Certificate</title>
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; background: #f4f7f6; margin: 0; padding: 24px; }
      .sheet { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #d7e7e1; border-radius: 14px; padding: 28px; }
      h1 { margin: 0 0 4px; color: #123a31; font-size: 34px; }
      .sub { margin: 0 0 18px; color: #4d6d63; }
      .grid { display: grid; grid-template-columns: 1fr 230px; gap: 18px; align-items: start; }
      .item { margin: 0 0 10px; color: #264b42; }
      .label { font-weight: 700; color: #143a31; }
      .qr { border: 1px solid #cde0d8; border-radius: 12px; background: #f7fcfa; padding: 12px; text-align: center; }
      .qr img { width: 190px; height: 190px; }
      .score { display: inline-block; margin-top: 8px; border-radius: 999px; background: #ddf9eb; color: #186d4c; border: 1px solid #186d4c; padding: 5px 12px; font-weight: 700; }
      .footer { margin-top: 22px; border-top: 1px dashed #bdd7ce; padding-top: 14px; color: #3d5f56; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <h1>Pramaan Certificate</h1>
      <p class="sub">Authenticity and Origin Record</p>
      <div class="grid">
        <div>
          <p class="item"><span class="label">Product Name:</span> ${escapedProductName}</p>
          <p class="item"><span class="label">Artisan Name:</span> ${escapedArtisanName}</p>
          <p class="item"><span class="label">GI Tag:</span> ${escapedGiTag}</p>
          <p class="item"><span class="label">Registration Date:</span> ${escapedDate}</p>
          <p class="item"><span class="label">Terroir Score:</span> <span class="score">100</span></p>
        </div>
        <div class="qr">
          <img src="${successData.qrDataUrl}" alt="Product verification QR" />
          <div style="margin-top:8px; color:#355; font-size:12px;">Scan to verify</div>
        </div>
      </div>
      <div class="footer">Verified on Pramaan — Sepolia Blockchain</div>
    </div>
  </body>
</html>`;

    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      setStatusText("Popup blocked. Please allow popups to open the certificate.");
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (!productImage) {
      setStatusText("Please upload a product image.");
      return;
    }

    if (!productHash) {
      setStatusText("Product hash not ready yet.");
      return;
    }

    setLoading(true);
    setStatusText("");
    setSuccess(null);
    setStepProgress("Step 1/3: Uploading product image to IPFS...");

    try {
      const cid = await uploadToIPFS(productImage);

      setStepProgress("Step 2/3: Anchoring product identity on Sepolia...");

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

      setStepProgress("Step 3/3: Confirming...");

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      const ipfsUrl = getIPFSUrl(cid);
      const verifyUrl = "/verify?hash=" + productHash;
      const transferUrl = "/transfer?hash=" + productHash;
      const verifyAbsoluteUrl =
        (typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app") + verifyUrl;
      const qrDataUrl = await QRCode.toDataURL(verifyAbsoluteUrl, { margin: 1, width: 256 });

      setSuccess({
        productHash,
        ipfsUrl,
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        verifyUrl,
        transferUrl,
        qrDataUrl,
        productName: form.name.trim(),
        artisanName: String(artisan?.name || "Unknown Artisan"),
        giTag: form.giTag.trim(),
        registrationDate: new Date().toLocaleString()
      });

      setStatusText("Product registered successfully.");
    } catch (error) {
      setStatusText(error?.shortMessage || error?.message || "Product registration failed.");
    } finally {
      setLoading(false);
      setStepProgress("");
    }
  }

  if (checking) {
    return (
      <section style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Register Product</h1>
        <p style={{ margin: 0, color: "#466" }}>Checking artisan identity...</p>
      </section>
    );
  }

  if (!isVerified) {
    return (
      <section style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Register Product</h1>
        <p style={{ margin: 0, color: "#8a1f1f", fontWeight: 600 }}>
          You must register as an artisan before registering products.
        </p>
        <Link href="/artisan" style={linkStyle}>
          Go to Artisan Registration
        </Link>
      </section>
    );
  }

  const badge = getCraftScoreBadge(artisan?.craftScore);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Register Product</h1>
      <p style={{ margin: 0, color: "#466" }}>
        Upload product proof, hash it, pin to IPFS, then register on-chain.
      </p>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Verified Artisan</h3>
        <p style={textStyle}>Wallet: {walletAddress}</p>
        <p style={textStyle}>Name: {artisan?.name}</p>
        <p style={textStyle}>Craft Type: {artisan?.craft}</p>
        <p style={textStyle}>GI Region: {artisan?.giRegion || giRegions[String(artisan?.craft || "")] || "-"}</p>
        <p style={textStyle}>
          Craft Score:
          <span
            style={{
              marginLeft: 8,
              background: badge.bg,
              color: badge.color,
              border: "1px solid " + badge.color,
              borderRadius: 999,
              padding: "2px 9px",
              fontWeight: 700
            }}
          >
            {String(artisan?.craftScore || 0)}
          </span>
        </p>
        <p style={textStyle}>SBT Token ID: {tokenId}</p>
      </div>

      <form onSubmit={onSubmit} style={formStyle}>
        <input
          required
          placeholder="Product name (e.g. First Flush Darjeeling 2024)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          placeholder="GI Tag"
          value={form.giTag}
          readOnly
          style={inputStyle}
        />
        <input
          required
          type="number"
          placeholder="Latitude"
          value={form.lat}
          onChange={(e) => setForm({ ...form, lat: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          type="number"
          placeholder="Longitude"
          value={form.lng}
          onChange={(e) => setForm({ ...form, lng: e.target.value })}
          style={inputStyle}
        />

        <input
          type="number"
          placeholder="Batch size (optional)"
          value={form.batchSize}
          onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
          style={inputStyle}
        />

        <input type="file" accept="image/*" required onChange={onImageChange} style={inputStyle} />

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Product preview"
            style={{ width: "100%", maxWidth: 360, borderRadius: 10, border: "1px solid #d3e6df" }}
          />
        )}

        {productHash && (
          <p style={{ margin: 0, color: "#2f5a50", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            Product hash: {getTruncatedHash(productHash)}
          </p>
        )}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Processing..." : "Register Product"}
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

      {statusText && <p style={{ margin: 0, color: "#355" }}>{statusText}</p>}

      {success && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 8, color: "#1f6d50" }}>Registration Complete</h3>
          <p style={textStyle}>Product hash: {success.productHash}</p>
          <p style={textStyle}>
            IPFS Image:{" "}
            <a href={success.ipfsUrl} target="_blank" rel="noreferrer" style={linkStyle}>
              {success.ipfsUrl}
            </a>
          </p>
          {success.txUrl && (
            <p style={textStyle}>
              Etherscan:{" "}
              <a href={success.txUrl} target="_blank" rel="noreferrer" style={linkStyle}>
                View tx
              </a>
            </p>
          )}

          <div style={{ maxWidth: 340, marginTop: 12 }}>
            <TerritorScore score={100} />
          </div>

          <p style={textStyle}>
            Verification URL:{" "}
            <Link href={success.verifyUrl} style={linkStyle}>
              {success.verifyUrl}
            </Link>
          </p>

          {success.qrDataUrl && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <img
                src={success.qrDataUrl}
                alt="Product verification QR"
                style={{ width: 210, height: 210, border: "1px solid #cfe2db", borderRadius: 12, padding: 8 }}
              />
              <p style={{ margin: 0, color: "#355" }}>Print or attach this QR to your product packaging.</p>
              <p style={{ margin: 0, color: "#355" }}>Consumers scan it to verify authenticity instantly.</p>
            </div>
          )}

          <button
            type="button"
            style={{ ...buttonStyle, marginTop: 10 }}
            onClick={() => openCertificate(success)}
          >
            Download Certificate
          </button>

          <Link href={success.transferUrl} style={buttonStyle}>
            Transfer Ownership
          </Link>
        </div>
      )}
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
  width: "fit-content",
  textDecoration: "none",
  display: "inline-block"
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 14,
  maxWidth: 760
};

const textStyle = { margin: "4px 0", color: "#355" };

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};
