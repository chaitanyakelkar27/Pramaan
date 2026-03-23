"use client";

import { ethers } from "ethers";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PRODUCT_ABI } from "../../../src/utils/abi";
import { PRODUCT_REGISTRY_ADDRESS, RPC_URL } from "../../../src/utils/constants";

const AUTH_MESSAGE = "Authentic Pramaan Scan";

function normalizeSecretKey(value) {
    const raw = String(value || "").trim();
    const unquoted = raw.replace(/^['\"]|['\"]$/g, "").trim();
    if (!unquoted) {
        return "";
    }
    return unquoted.startsWith("0x") ? unquoted : "0x" + unquoted;
}

function shortAddress(address) {
    if (!address) {
        return "-";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
}

export default function ProductHashVerifyPage() {
    const params = useParams();
    const searchParams = useSearchParams();

    const productHash = useMemo(() => {
        const raw = params?.productHash;
        return Array.isArray(raw) ? raw[0] : raw || "";
    }, [params]);

    const secret = normalizeSecretKey(searchParams.get("secret") || "");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [verified, setVerified] = useState(false);
    const [details, setDetails] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function verifyFromChain() {
            setLoading(true);
            setError("");

            try {
                if (!productHash) {
                    throw new Error("Missing product hash in URL.");
                }

                if (!secret) {
                    throw new Error("Missing secret query parameter in QR URL.");
                }

                if (!ethers.utils.isHexString(productHash) || ethers.utils.hexDataLength(productHash) !== 32) {
                    throw new Error("Invalid product hash format. Expected bytes32 hex string.");
                }

                if (!PRODUCT_REGISTRY_ADDRESS || PRODUCT_REGISTRY_ADDRESS === "PASTE_ADDRESS_HERE") {
                    throw new Error("Product registry address is not configured in environment variables.");
                }

                const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
                const contract = new ethers.Contract(PRODUCT_REGISTRY_ADDRESS, PRODUCT_ABI, provider);

                const result = await contract.verifyProduct(productHash);
                const record = result[0];
                const provenanceSigner = String(record.provenanceSigner || ethers.constants.AddressZero);

                const wallet = new ethers.Wallet(secret);
                const signature = await wallet.signMessage(AUTH_MESSAGE);
                const recoveredAddress = ethers.utils.verifyMessage(AUTH_MESSAGE, signature);

                const isMatch = recoveredAddress.toLowerCase() === provenanceSigner.toLowerCase();

                if (!cancelled) {
                    setVerified(isMatch);
                    setDetails({
                        productHash,
                        provenanceSigner,
                        recoveredAddress,
                        productName: record.productName,
                        giTag: record.giTag
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err?.shortMessage || err?.reason || err?.message || "Verification failed.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        verifyFromChain();

        return () => {
            cancelled = true;
        };
    }, [productHash, secret]);

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_55%,_#000000_100%)] px-4 py-8 text-slate-100">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur">
                    <p className="m-0 text-xs uppercase tracking-[0.28em] text-emerald-300/80">Pramaan Hardware Handshake</p>
                    <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Scan Integrity Check</h1>
                    <p className="mt-3 text-slate-300">
                        We compare a recovered signer from your secret with the on-chain provenance signer for this product.
                    </p>
                </div>

                {loading && (
                    <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-10 text-center">
                        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
                        <p className="m-0 text-xl font-semibold text-slate-100">Verifying hardware signature...</p>
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded-3xl border border-rose-500/60 bg-rose-950/70 p-8 text-rose-100">
                        <p className="m-0 text-3xl font-black">Verification Error</p>
                        <p className="mt-2 text-base text-rose-200">{error}</p>
                    </div>
                )}

                {!loading && !error && details && verified && (
                    <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-950/80 p-8 shadow-[0_0_65px_rgba(16,185,129,0.28)]">
                        <p className="m-0 text-center text-6xl md:text-8xl">✅</p>
                        <h2 className="mt-3 text-center text-4xl font-black tracking-tight text-emerald-200 md:text-6xl">Hardware Verified</h2>
                        <p className="mt-3 text-center text-lg text-emerald-100">
                            On-chain provenance signer matches the signature recovered from your scan secret.
                        </p>
                    </div>
                )}

                {!loading && !error && details && !verified && (
                    <div className="rounded-3xl border-2 border-rose-500 bg-rose-950/80 p-8 shadow-[0_0_65px_rgba(244,63,94,0.3)]">
                        <p className="m-0 text-center text-6xl md:text-8xl">❌</p>
                        <h2 className="mt-3 text-center text-4xl font-black tracking-tight text-rose-200 md:text-6xl">Fake Item Detected</h2>
                        <p className="mt-3 text-center text-lg text-rose-100">
                            Recovered signer does not match the on-chain provenance signer.
                        </p>
                    </div>
                )}

                {!loading && !error && details && (
                    <div className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/70 p-6 md:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 md:col-span-2">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Product</p>
                            <p className="m-0 text-xl font-bold text-slate-100">
                                {details.productName || "Unnamed Product"}
                                {details.giTag ? " (" + details.giTag + ")" : ""}
                            </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Product Hash</p>
                            <p className="m-0 break-all font-mono text-sm text-slate-200">{details.productHash}</p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Expected Provenance Signer</p>
                            <p className="m-0 break-all font-mono text-sm text-slate-200" title={details.provenanceSigner}>
                                {shortAddress(details.provenanceSigner)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 md:col-span-2">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Recovered Signer</p>
                            <p className="m-0 break-all font-mono text-sm text-slate-200" title={details.recoveredAddress}>
                                {shortAddress(details.recoveredAddress)}
                            </p>
                        </div>
                    </div>
                )}

                <div>
                    <Link href="/verify" className="text-sm font-semibold text-emerald-300 no-underline hover:text-emerald-200">
                        Back to scan and manual verify
                    </Link>
                </div>
            </div>
        </main>
    );
}
