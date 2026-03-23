"use client";

import { ethers } from "ethers";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { appendEvidenceEntry } from "../../../src/utils/evidence";
import { checkpointScanNonce, isScanNonceUsed, verifyProduct } from "../../../src/utils/contract";
import { CHAIN_ID, PRODUCT_REGISTRY_ADDRESS } from "../../../src/utils/constants";

const AUTH_MESSAGE = "Authentic Pramaan Scan";
const ZERO_HASH = "0x" + "00".repeat(32);

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

function normalizeNonce(value) {
    const text = String(value || "").trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(text)) {
        return "";
    }
    return text;
}

function randomNonce() {
    return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}

function buildAttestationDigest(record, hash) {
    return ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            [
                "uint256",
                "address",
                "bytes32",
                "bytes32",
                "address",
                "address",
                "string",
                "string",
                "string",
                "uint256",
                "uint256"
            ],
            [
                CHAIN_ID,
                PRODUCT_REGISTRY_ADDRESS,
                hash,
                record.metadataHash,
                record.artisan,
                record.provenanceSigner,
                record.ipfsCid,
                record.productName,
                record.giTag,
                record.origin_lat,
                record.origin_lng
            ]
        )
    );
}

export default function ProductHashVerifyPage() {
    const params = useParams();
    const searchParams = useSearchParams();

    const productHash = useMemo(() => {
        const raw = params?.productHash;
        return Array.isArray(raw) ? raw[0] : raw || "";
    }, [params]);

    const secret = normalizeSecretKey(searchParams.get("secret") || "");
    const nonceFromUrl = normalizeNonce(searchParams.get("nonce") || "");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [checkpointLoading, setCheckpointLoading] = useState(false);
    const [scanNonce, setScanNonce] = useState("");
    const [details, setDetails] = useState(null);
    const [checkpointState, setCheckpointState] = useState({
        checkedUsed: null,
        checkpointed: false,
        replayed: null,
        txUrl: ""
    });

    useEffect(() => {
        let cancelled = false;

        async function verifyFromChain() {
            setLoading(true);
            setError("");

            try {
                if (!productHash) {
                    throw new Error("Missing product hash in URL.");
                }

                if (!ethers.utils.isHexString(productHash) || ethers.utils.hexDataLength(productHash) !== 32) {
                    throw new Error("Invalid product hash format. Expected bytes32 hex string.");
                }

                if (!PRODUCT_REGISTRY_ADDRESS || PRODUCT_REGISTRY_ADDRESS === "PASTE_ADDRESS_HERE") {
                    throw new Error("Product registry address is not configured in environment variables.");
                }

                const { record } = await verifyProduct(productHash);
                const provenanceSigner = String(record.provenanceSigner || ethers.constants.AddressZero);

                const activeNonce = nonceFromUrl || randomNonce();
                const nonceAlreadyUsed = Boolean(await isScanNonceUsed(productHash, activeNonce));

                const hasMetadataHash = String(record.metadataHash || ZERO_HASH).toLowerCase() !== ZERO_HASH;
                const hasDeviceSignature = String(record.deviceSignature || "0x") !== "0x";

                const attestationDigest = buildAttestationDigest(record, productHash);

                let recoveredFromDeviceSignature = ethers.constants.AddressZero;
                let deviceSignatureMatches = false;
                if (hasDeviceSignature) {
                    recoveredFromDeviceSignature = ethers.utils.verifyMessage(
                        ethers.utils.arrayify(attestationDigest),
                        record.deviceSignature
                    );
                    deviceSignatureMatches = recoveredFromDeviceSignature.toLowerCase() === provenanceSigner.toLowerCase();
                }

                let recoveredFromSecret = ethers.constants.AddressZero;
                let secretMatches = false;
                if (secret) {
                    const wallet = new ethers.Wallet(secret);
                    const challenge = AUTH_MESSAGE + ":" + productHash + ":" + activeNonce;
                    const challengeSignature = await wallet.signMessage(challenge);
                    recoveredFromSecret = ethers.utils.verifyMessage(challenge, challengeSignature);
                    secretMatches = recoveredFromSecret.toLowerCase() === provenanceSigner.toLowerCase();
                }

                const verified = Boolean(deviceSignatureMatches && hasMetadataHash);

                if (!cancelled) {
                    setScanNonce(activeNonce);
                    setCheckpointState({
                        checkedUsed: nonceAlreadyUsed,
                        checkpointed: false,
                        replayed: null,
                        txUrl: ""
                    });
                    setDetails({
                        productHash,
                        verified,
                        hasMetadataHash,
                        hasDeviceSignature,
                        deviceSignatureMatches,
                        secretMatches,
                        secretProvided: Boolean(secret),
                        provenanceSigner,
                        recoveredFromDeviceSignature,
                        recoveredFromSecret,
                        productName: record.productName,
                        giTag: record.giTag,
                        metadataHash: record.metadataHash
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
    }, [productHash, secret, nonceFromUrl]);

    async function onCheckpointNonce() {
        if (!details || !scanNonce) {
            return;
        }

        setCheckpointLoading(true);
        setError("");

        try {
            const result = await checkpointScanNonce(details.productHash, scanNonce);
            const txHash = result?.receipt?.transactionHash || result?.receipt?.hash || "";
            const replayed = Boolean(result?.replayed);

            setCheckpointState({
                checkedUsed: checkpointState.checkedUsed,
                checkpointed: true,
                replayed,
                txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : ""
            });

            if (txHash) {
                appendEvidenceEntry({
                    action: "Nonce Checkpoint",
                    productHash: details.productHash,
                    txUrl: "https://sepolia.etherscan.io/tx/" + txHash,
                    notes: replayed ? "Replay detected for nonce " + scanNonce : "First scan for nonce " + scanNonce
                });
            }
        } catch (err) {
            setError(err?.shortMessage || err?.reason || err?.message || "Could not checkpoint nonce.");
        } finally {
            setCheckpointLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#0f172a_0%,#020617_55%,#000000_100%)] px-4 py-8 text-slate-100">
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

                {!loading && !error && details && details.verified && (
                    <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-950/80 p-8 shadow-[0_0_65px_rgba(16,185,129,0.28)]">
                        <p className="m-0 text-center text-6xl md:text-8xl">✅</p>
                        <h2 className="mt-3 text-center text-4xl font-black tracking-tight text-emerald-200 md:text-6xl">Attestation Verified</h2>
                        <p className="mt-3 text-center text-lg text-emerald-100">
                            On-chain device attestation matches the configured provenance signer.
                        </p>
                    </div>
                )}

                {!loading && !error && details && !details.verified && (
                    <div className="rounded-3xl border-2 border-rose-500 bg-rose-950/80 p-8 shadow-[0_0_65px_rgba(244,63,94,0.3)]">
                        <p className="m-0 text-center text-6xl md:text-8xl">❌</p>
                        <h2 className="mt-3 text-center text-4xl font-black tracking-tight text-rose-200 md:text-6xl">Attestation Failed</h2>
                        <p className="mt-3 text-center text-lg text-rose-100">
                            Metadata hash or device signature does not satisfy the expected provenance check.
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
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Recovered From Device Signature</p>
                            <p className="m-0 break-all font-mono text-sm text-slate-200" title={details.recoveredFromDeviceSignature}>
                                {shortAddress(details.recoveredFromDeviceSignature)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Metadata Hash Anchored</p>
                            <p className="m-0 text-sm text-slate-200">{details.hasMetadataHash ? "Yes" : "No"}</p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Device Signature Present</p>
                            <p className="m-0 text-sm text-slate-200">{details.hasDeviceSignature ? "Yes" : "No"}</p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 md:col-span-2">
                            <p className="m-0 text-xs uppercase tracking-widest text-slate-400">Scan Nonce</p>
                            <p className="m-0 break-all font-mono text-sm text-slate-200">{scanNonce}</p>
                            <p className="m-0 mt-2 text-sm text-slate-300">
                                Pre-check: {checkpointState.checkedUsed ? "Nonce already seen (possible replay)." : "Nonce not seen yet."}
                            </p>
                            {details.secretProvided && (
                                <p className="m-0 mt-1 text-sm text-slate-300">
                                    QR secret challenge: {details.secretMatches ? "matched provenance signer" : "did not match provenance signer"}
                                </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onCheckpointNonce}
                                    disabled={checkpointLoading}
                                    className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                                >
                                    {checkpointLoading ? "Checkpointing..." : "Checkpoint This Scan On-Chain"}
                                </button>
                                {checkpointState.checkpointed && (
                                    <span className="text-sm text-slate-200">
                                        Result: {checkpointState.replayed ? "Replay detected" : "Fresh scan recorded"}
                                    </span>
                                )}
                                {checkpointState.txUrl && (
                                    <a href={checkpointState.txUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-300 no-underline">
                                        View checkpoint tx
                                    </a>
                                )}
                            </div>
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
