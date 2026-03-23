"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

function extractScannedValue(payload) {
    if (!payload) {
        return "";
    }

    if (typeof payload === "string") {
        return payload;
    }

    if (Array.isArray(payload) && payload.length > 0) {
        const first = payload[0];
        if (typeof first === "string") {
            return first;
        }
        if (typeof first?.rawValue === "string") {
            return first.rawValue;
        }
        if (typeof first?.value === "string") {
            return first.value;
        }
    }

    if (typeof payload?.rawValue === "string") {
        return payload.rawValue;
    }

    if (typeof payload?.value === "string") {
        return payload.value;
    }

    return "";
}

export default function QrRedirectScanner() {
    const router = useRouter();
    const [status, setStatus] = useState("Point your camera at a Pramaan QR code.");
    const [hasRedirected, setHasRedirected] = useState(false);

    const handleScan = useCallback(
        (payload) => {
            if (hasRedirected) {
                return;
            }

            const scannedText = extractScannedValue(payload).trim();
            if (!scannedText) {
                return;
            }

            try {
                const target = new URL(scannedText, window.location.origin);
                setHasRedirected(true);
                setStatus("QR detected. Opening verification...");

                if (target.origin === window.location.origin) {
                    router.replace(target.pathname + target.search + target.hash);
                    return;
                }

                window.location.assign(target.toString());
            } catch (_error) {
                setStatus("QR detected, but it did not contain a valid URL.");
            }
        },
        [hasRedirected, router]
    );

    const handleError = useCallback(() => {
        setStatus("Unable to access camera. Allow camera permissions and reload.");
    }, []);

    return (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-black/30">
            <div className="mb-3">
                <p className="m-0 text-sm font-semibold text-slate-100">Live QR Verification</p>
                <p className="m-0 text-xs text-slate-400">Scan once to jump directly into authenticity check.</p>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-black">
                <Scanner
                    onScan={handleScan}
                    onError={handleError}
                    constraints={{ facingMode: "environment" }}
                    scanDelay={350}
                    styles={{
                        container: { width: "100%" },
                        video: { width: "100%", height: "100%", objectFit: "cover" }
                    }}
                />
            </div>

            <p className="mt-3 text-xs text-slate-300">{status}</p>
        </div>
    );
}
