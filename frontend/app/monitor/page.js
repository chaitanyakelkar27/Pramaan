"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, http, webSocket } from "viem";
import { sepolia } from "viem/chains";
import { PRODUCT_ABI } from "../../src/utils/abi";
import { PRODUCT_REGISTRY_ADDRESS, RPC_URL, WS_RPC_URL } from "../../src/utils/constants";
import StatusMessage from "../../components/StatusMessage";

// User-friendly messages
const MESSAGES = {
  connecting: "Connecting to the live event stream...",
  connected: "Live stream connected. New events will appear automatically.",
  disconnected: "Connection lost. Please refresh the page to reconnect.",
  error: "Could not connect to the event stream. Please check your network connection.",
  noEvents: "No events yet. Register or transfer a product to see activity here.",
  missingAddress: "Contract address not configured. Please check your environment settings."
};

export default function MonitorPage() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({ type: "progress", text: MESSAGES.connecting });
  const unsubRef = useRef([]);

  const wsClient = useMemo(() => {
    return createPublicClient({
      chain: sepolia,
      transport: webSocket(WS_RPC_URL)
    });
  }, []);

  const httpClient = useMemo(() => {
    return createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL)
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function attachWatchers() {
      if (!PRODUCT_REGISTRY_ADDRESS || PRODUCT_REGISTRY_ADDRESS === "PASTE_ADDRESS_HERE") {
        setStatus({ type: "error", text: MESSAGES.missingAddress });
        return;
      }

      const pushEvent = (item) => {
        if (!mounted) {
          return;
        }
        setEvents((prev) => [item, ...prev].slice(0, 60));
      };

      try {
        const unwatchRegistered = wsClient.watchContractEvent({
          address: PRODUCT_REGISTRY_ADDRESS,
          abi: PRODUCT_ABI,
          eventName: "ProductRegistered",
          onLogs: async (logs) => {
            for (const log of logs) {
              const block = await httpClient.getBlock({ blockNumber: log.blockNumber });
              pushEvent({
                id: String(log.transactionHash) + ":reg",
                type: "ProductRegistered",
                label: "New Product Registered",
                hash: log.args.productHash,
                txHash: log.transactionHash,
                time: new Date(Number(block.timestamp) * 1000).toLocaleString()
              });
            }
          },
          onError: () => {
            if (mounted) {
              setStatus({ type: "error", text: MESSAGES.disconnected });
            }
          }
        });

        const unwatchTransferred = wsClient.watchContractEvent({
          address: PRODUCT_REGISTRY_ADDRESS,
          abi: PRODUCT_ABI,
          eventName: "ProductTransferred",
          onLogs: async (logs) => {
            for (const log of logs) {
              const block = await httpClient.getBlock({ blockNumber: log.blockNumber });
              pushEvent({
                id: String(log.transactionHash) + ":xfer",
                type: "ProductTransferred",
                label: "Product Transferred",
                hash: log.args.productHash,
                txHash: log.transactionHash,
                from: log.args.from,
                to: log.args.to,
                count: Number(log.args.transferCount),
                time: new Date(Number(block.timestamp) * 1000).toLocaleString()
              });
            }
          },
          onError: () => {
            if (mounted) {
              setStatus({ type: "error", text: MESSAGES.disconnected });
            }
          }
        });

        unsubRef.current = [unwatchRegistered, unwatchTransferred];
        
        if (mounted) {
          setStatus({ type: "success", text: MESSAGES.connected });
        }
      } catch (_error) {
        if (mounted) {
          setStatus({ type: "error", text: MESSAGES.error });
        }
      }
    }

    attachWatchers();

    return () => {
      mounted = false;
      for (const stop of unsubRef.current) {
        if (typeof stop === "function") {
          stop();
        }
      }
      unsubRef.current = [];
    };
  }, [httpClient, wsClient]);

  function truncateHash(hash) {
    if (!hash || hash.length < 20) {
      return hash;
    }
    return hash.slice(0, 10) + "..." + hash.slice(-6);
  }

  function truncateAddress(address) {
    if (!address) {
      return "-";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Live Monitor</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          Watch product registrations and transfers happen in real-time on the blockchain.
        </p>
      </div>

      {/* Connection Status */}
      <StatusMessage type={status.type || "info"} message={status.text} animate={false} />

      {/* Events Timeline */}
      <div style={{ display: "grid", gap: "var(--space-md)" }}>
        {events.length === 0 && (
          <div className="card-base" style={{ textAlign: "center", padding: "var(--space-2xl)" }}>
            <p style={{ margin: 0, color: "var(--color-text-muted)" }}>{MESSAGES.noEvents}</p>
          </div>
        )}

        {events.map((event) => (
          <div 
            key={event.id} 
            className="card-base"
            style={{ 
              borderLeft: `4px solid ${event.type === "ProductRegistered" ? "var(--color-success)" : "var(--color-primary)"}` 
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-md)", flexWrap: "wrap" }}>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    fontSize: 12,
                    fontWeight: 700,
                    background: event.type === "ProductRegistered" ? "var(--color-success-bg)" : "var(--color-info-bg)",
                    color: event.type === "ProductRegistered" ? "var(--color-success)" : "var(--color-info)",
                    marginBottom: "var(--space-sm)"
                  }}
                >
                  {event.label}
                </span>
              </div>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{event.time}</span>
            </div>

            <div style={{ display: "grid", gap: "var(--space-xs)", marginTop: "var(--space-sm)" }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                <strong>Product:</strong>{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>{truncateHash(event.hash)}</span>
              </p>
              
              {event.from && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                  <strong>From:</strong>{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>{truncateAddress(event.from)}</span>
                  {" "}<strong>To:</strong>{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>{truncateAddress(event.to)}</span>
                </p>
              )}
              
              {typeof event.count === "number" && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                  <strong>Transfer #:</strong> {event.count}
                </p>
              )}
            </div>

            <a 
              href={"https://sepolia.etherscan.io/tx/" + event.txHash} 
              target="_blank" 
              rel="noreferrer" 
              className="link-primary"
              style={{ marginTop: "var(--space-sm)", display: "inline-block", fontSize: 14 }}
            >
              View transaction
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
