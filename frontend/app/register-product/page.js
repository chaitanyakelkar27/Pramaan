"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import TerritorScore from "../../components/TerritorScore";
import { giRegions } from "../../src/utils/craftDetector";
import { getArtisan, getArtisanTokenId, connectWallet, isVerifiedArtisan, registerProduct } from "../../src/utils/contract";
import { hashProduct } from "../../src/utils/hash";
import { getIPFSUrl, uploadToIPFS } from "../../src/utils/ipfs";

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
        const verified = Boolean(await isVerifiedArtisan(address));
        const hasRegistration = Number(artisanRecord?.registeredAt || 0) > 0;

        if (!mounted) {
          return;
        }

        setIsVerified(verified);
        setArtisan(artisanRecord);

        if (!verified) {
          if (hasRegistration) {
            setStatusText(
              "Artisan SBT found, but wallet is not fully verified yet. Open Artisan page and sync Aadhaar on-chain."
            );
          } else {
            setStatusText("You must register as an artisan before registering products.");
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

  function isAlreadyRegisteredError(error) {
    const text = String(error?.shortMessage || error?.message || "").toLowerCase();
    return text.includes("product already registered");
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

      setSuccess({
        productHash,
        ipfsUrl,
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        verifyUrl,
        transferUrl
      });

      setStatusText("Product registered successfully.");
    } catch (error) {
      if (isAlreadyRegisteredError(error)) {
        const verifyUrl = "/verify?hash=" + productHash;
        setStatusText("Product already registered. Redirecting to verification page...");
        setStepProgress("Opening existing record...");
        router.push(verifyUrl);
      } else {
        setStatusText(error?.shortMessage || error?.message || "Product registration failed.");
      }
    } finally {
      setLoading(false);
      setStepProgress("");
    }
  }

  if (checking) {
    return (
      <section className="grid gap-3">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Register Product</h1>
        <p className="m-0 text-[#49665e]">Checking artisan identity...</p>
      </section>
    );
  }

  if (!isVerified) {
    return (
      <section className="grid gap-4">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Register Product</h1>
        <p className="m-0 font-semibold text-[#8a1f1f]">
          {statusText || "You must register as an artisan before registering products."}
        </p>
        <Card className="max-w-2xl bg-[#fff9f9]">
          <CardContent className="grid gap-2 p-4 text-[#49665e]">
            {walletAddress && <p className="m-0">Wallet: {walletAddress}</p>}
            <p className="m-0">SBT Token ID: {tokenId}</p>
            <Link href="/artisan" className="w-fit no-underline">
              <Button>Go to Artisan Registration</Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Register Product</h1>
        <p className="m-0 text-[#49665e]">Upload product proof, hash it, pin to IPFS, then register on-chain.</p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader className="pb-2">
          <CardTitle>Verified Artisan</CardTitle>
          <CardDescription>This identity is eligible to register product twins.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Wallet</p>
            <p className="m-0 break-all font-mono text-sm text-[#20473d]">{walletAddress}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Name</p>
            <p className="m-0 text-lg font-semibold text-[#20473d]">{artisan?.name || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">SBT Token ID</p>
            <p className="m-0 text-lg font-semibold text-[#20473d]">{tokenId}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Craft Type</p>
            <p className="m-0 text-base font-medium text-[#20473d]">{artisan?.craft || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">GI Region</p>
            <p className="m-0 text-base font-medium text-[#20473d]">{artisan?.giRegion || giRegions[String(artisan?.craft || "")] || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Aadhaar Status</p>
            <div className="mt-1">
              <Badge variant={artisan?.isAadhaarVerified ? "default" : "warm"}>
                {artisan?.isAadhaarVerified ? "Verified" : "Not Verified"}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Fraud Flag</p>
            <div className="mt-1">
              <Badge variant={artisan?.isFraudulent ? "warm" : "default"}>
                {artisan?.isFraudulent ? "Flagged" : "Clear"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader className="pb-2">
          <CardTitle>Product Metadata</CardTitle>
          <CardDescription>All fields except batch size are required for on-chain registration.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Input
              required
              placeholder="Product name (e.g. First Flush Darjeeling 2024)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              required
              placeholder="GI Tag"
              value={form.giTag}
              readOnly
            />
            <Input
              required
              type="number"
              placeholder="Latitude"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
            />
            <Input
              required
              type="number"
              placeholder="Longitude"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
            />

            <Input
              type="number"
              placeholder="Batch size (optional)"
              value={form.batchSize}
              onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
            />

            <Input type="file" accept="image/*" required onChange={onImageChange} />

            {previewUrl && (
              <img
                src={previewUrl}
                alt="Product preview"
                className="w-full max-w-md rounded-xl border border-[#d3e6df]"
              />
            )}

            {productHash && (
              <p className="m-0 font-mono text-[#2f5a50]">
                Product hash: {getTruncatedHash(productHash)}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-fit">
              {loading ? "Processing..." : "Register Product"}
            </Button>

            {stepProgress && (
              <div className="rounded-lg border border-dashed border-[#b4d8cb] bg-[#eff8f4] px-3 py-2 text-[#2f5a50]">
                {stepProgress}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {statusText && <p className="m-0 text-[#355]">{statusText}</p>}

      {success && (
        <Card className="max-w-4xl">
          <CardHeader className="pb-2">
            <CardTitle>Registration Complete</CardTitle>
            <CardDescription>Product twin has been anchored successfully.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-[#355]">
            <p className="m-0">Product hash: {success.productHash}</p>
            <p className="m-0">
              IPFS Image:{" "}
              <a href={success.ipfsUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#176f52] no-underline">
                {success.ipfsUrl}
              </a>
            </p>
            {success.txUrl && (
              <p className="m-0">
                Etherscan:{" "}
                <a href={success.txUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#176f52] no-underline">
                  View tx
                </a>
              </p>
            )}

            <div style={{ maxWidth: 340, marginTop: 12 }}>
              <TerritorScore score={100} />
            </div>

            <p className="m-0">
              Verification URL:{" "}
              <Link href={success.verifyUrl} className="font-semibold text-[#176f52] no-underline">
                {success.verifyUrl}
              </Link>
            </p>

            <Link href={success.transferUrl} className="w-fit no-underline">
              <Button>Transfer Ownership</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
