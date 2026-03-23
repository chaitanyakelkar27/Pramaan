"use client";

import { ethers } from "ethers";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import QrRedirectScanner from "../../components/QrRedirectScanner";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export default function RetailerVerifyPage() {
    const [baseUrl, setBaseUrl] = useState("");
    const [productHash, setProductHash] = useState(process.env.NEXT_PUBLIC_DEMO_PRODUCT_HASH || "");
    const [secret, setSecret] = useState(process.env.NEXT_PUBLIC_DEMO_SCAN_SECRET || "");
    const [copyStatus, setCopyStatus] = useState("");
    const [demoLoading, setDemoLoading] = useState(false);
    const [demoSource, setDemoSource] = useState("");
    const [expectedSigner, setExpectedSigner] = useState("");

    useEffect(() => {
        if (typeof window !== "undefined") {
            setBaseUrl(window.location.origin);
            const params = new URLSearchParams(window.location.search);
            const hashFromUrl = params.get("productHash") || "";
            if (hashFromUrl) {
                setProductHash(hashFromUrl);
            }
        }
    }, []);

    const trimmedHash = productHash.trim();
    const trimmedSecret = secret.trim();

    const normalizedSecret = useMemo(() => {
        const unquoted = trimmedSecret.replace(/^['\"]|['\"]$/g, "").trim();
        if (!unquoted) {
            return "";
        }
        return unquoted.startsWith("0x") ? unquoted : "0x" + unquoted;
    }, [trimmedSecret]);

    const secretSigner = useMemo(() => {
        if (!normalizedSecret) {
            return "";
        }

        try {
            return ethers.utils.computeAddress(normalizedSecret);
        } catch (_error) {
            return "";
        }
    }, [normalizedSecret]);

    const verifyUrl = useMemo(() => {
        if (!baseUrl || !trimmedHash || !normalizedSecret) {
            return "";
        }

        const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        return (
            normalizedBase +
            "/verify/" +
            encodeURIComponent(trimmedHash) +
            "?secret=" +
            encodeURIComponent(normalizedSecret)
        );
    }, [baseUrl, trimmedHash, normalizedSecret]);

    async function onCopyUrl() {
        if (!verifyUrl) {
            setCopyStatus("Fill product hash and secret first.");
            return;
        }

        try {
            await navigator.clipboard.writeText(verifyUrl);
            setCopyStatus("Verification URL copied.");
        } catch (_error) {
            setCopyStatus("Copy failed. You can copy manually from the field below.");
        }
    }

    async function onLoadDemoData() {
        setDemoLoading(true);
        setCopyStatus("");

        try {
            const response = await fetch("/api/demo-qr", { method: "GET" });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload?.error || "Could not load demo data.");
            }

            if (payload?.productHash) {
                setProductHash(payload.productHash);
            }

            if (payload?.secret) {
                setSecret(payload.secret);
            }

            if (payload?.signer) {
                setExpectedSigner(payload.signer);
            }

            setDemoSource(payload?.source || "env");

            if (!payload?.secret) {
                setCopyStatus("Demo hash loaded, but secret is missing. Set DEMO_SCAN_SECRET in frontend/.env.local.");
            } else {
                setCopyStatus("Demo values loaded. QR is ready.");
            }
        } catch (error) {
            setCopyStatus(error?.message || "Failed to load demo values.");
        } finally {
            setDemoLoading(false);
        }
    }

    function onDownloadPng() {
        if (!verifyUrl) {
            setCopyStatus("Generate QR first.");
            return;
        }

        const svgElement = document.getElementById("retailer-demo-qr");
        if (!svgElement) {
            setCopyStatus("QR element not found.");
            return;
        }

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d");

            if (!context) {
                setCopyStatus("Could not create image canvas.");
                URL.revokeObjectURL(url);
                return;
            }

            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0);

            canvas.toBlob((blob) => {
                if (!blob) {
                    setCopyStatus("Could not generate PNG file.");
                    URL.revokeObjectURL(url);
                    return;
                }

                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = downloadUrl;
                a.download = "pramaan-demo-qr.png";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(downloadUrl);
                URL.revokeObjectURL(url);
                setCopyStatus("QR downloaded as PNG.");
            }, "image/png");
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            setCopyStatus("Could not render QR image for download.");
        };

        image.src = url;
    }

    return (
        <section className="grid gap-6">
            <div className="grid gap-2">
                <h1 className="m-0 text-3xl font-bold text-[#17352d]">Retailer QR Verify</h1>
                <p className="m-0 text-[#4a655d]">
                    This tab is for shop verification at sale time. Distributor generates this QR and retailer scans it.
                </p>
            </div>

            <Card className="max-w-4xl border-slate-800 bg-slate-900 text-slate-100">
                <CardHeader className="pb-2">
                    <CardTitle className="text-slate-100">Scan At Counter</CardTitle>
                    <CardDescription className="text-slate-400">
                        Open camera and scan product QR to jump directly into the hardware verification page.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <QrRedirectScanner />
                </CardContent>
            </Card>

            <Card className="max-w-4xl border-[#d5e4df]">
                <CardHeader className="pb-2">
                    <CardTitle>Generate Working Demo QR</CardTitle>
                    <CardDescription>
                        One-click demo: load test values, generate QR, scan from phone, and verify.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                    <div className="grid gap-2 rounded-xl border border-[#d5e4df] bg-[#f4fbf8] p-3">
                        <p className="m-0 text-sm font-semibold text-[#1f5f4e]">Step 1: Autofill demo values</p>
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" onClick={onLoadDemoData} disabled={demoLoading}>
                                {demoLoading ? "Loading Demo..." : "Load Demo Data"}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setBaseUrl(window.location.origin)}>
                                Use Current Base URL
                            </Button>
                        </div>
                        {demoSource && <p className="m-0 text-xs text-[#48695f]">Loaded from: {demoSource}</p>}
                    </div>

                    <p className="m-0 text-sm font-semibold text-[#1f5f4e]">Step 2: Confirm inputs</p>
                    <Input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="Base URL (e.g. http://localhost:3000)"
                    />
                    <Input
                        value={productHash}
                        onChange={(e) => setProductHash(e.target.value)}
                        placeholder="Product hash (0x... bytes32)"
                    />
                    <Input
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder="Secret/private key used for provenance signer"
                    />

                    {normalizedSecret && !secretSigner && (
                        <p className="m-0 text-sm text-[#8a1f1f]">Secret format is invalid. Use a valid EVM private key.</p>
                    )}

                    {expectedSigner && secretSigner && (
                        <p className="m-0 text-sm text-[#355]">
                            Signer check: {secretSigner.toLowerCase() === expectedSigner.toLowerCase() ? "Matched" : "Not matched"}
                        </p>
                    )}

                    {verifyUrl && (
                        <div className="grid gap-3 rounded-xl border border-[#d5e4df] bg-[#f8fcfb] p-4">
                            <p className="m-0 text-sm font-semibold text-[#1f5f4e]">Step 3: Scan this QR</p>
                            <div className="rounded-lg bg-white p-4 w-fit">
                                <QRCodeSVG id="retailer-demo-qr" value={verifyUrl} size={220} />
                            </div>

                            <div className="grid gap-2">
                                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Verification URL</p>
                                <p className="m-0 break-all font-mono text-sm text-[#244940]">{verifyUrl}</p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button type="button" onClick={onCopyUrl}>Copy URL</Button>
                                <Button type="button" variant="outline" onClick={onDownloadPng}>Download PNG</Button>
                                <a href={verifyUrl} target="_blank" rel="noreferrer" className="no-underline">
                                    <Button type="button" variant="outline">Open Verify Link</Button>
                                </a>
                            </div>
                        </div>
                    )}

                    {!verifyUrl && (
                        <p className="m-0 text-sm text-[#5f7b72]">
                            Fill base URL, product hash, and secret to generate a QR.
                        </p>
                    )}

                    {copyStatus && <p className="m-0 text-sm text-[#355]">{copyStatus}</p>}

                    <div className="rounded-xl border border-[#ead9b1] bg-[#fff8e8] p-3 text-sm text-[#7b5a13]">
                        If you scan from a phone, localhost will not open there. Use your LAN IP or deployed URL in Base URL.
                    </div>

                    <div className="rounded-xl border border-[#d5e4df] bg-[#f4fbf8] p-3">
                        <p className="m-0 mb-2 text-sm font-semibold text-[#1f5f4e]">Owner handoff</p>
                        <Link href="/transfer" className="no-underline">
                            <Button type="button">Transfer Owner</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
