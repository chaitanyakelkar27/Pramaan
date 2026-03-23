"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, formatEther, http, webSocket } from "viem";
import { sepolia } from "viem/chains";
import { PRODUCT_ABI } from "../../src/utils/abi";
import {
  DYNAMIC_ROYALTY_ADDRESS,
  ESCROW_MARKETPLACE_ADDRESS,
  PRODUCT_REGISTRY_ADDRESS,
  RPC_URL,
  WS_RPC_URL
} from "../../src/utils/constants";

const ESCROW_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "address", name: "seller", type: "address" },
      { indexed: false, internalType: "uint256", name: "salePrice", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "shippingDeadline", type: "uint256" }
    ],
    name: "EscrowCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "confirmDeadline", type: "uint256" }
    ],
    name: "EscrowShipped",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "artisanAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "sellerAmount", type: "uint256" }
    ],
    name: "EscrowCompleted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "EscrowRefunded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "address", name: "raisedBy", type: "address" },
      { indexed: false, internalType: "string", name: "reason", type: "string" }
    ],
    name: "EscrowDisputed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: false, internalType: "bool", name: "sellerWins", type: "bool" },
      { indexed: false, internalType: "string", name: "resolution", type: "string" }
    ],
    name: "EscrowResolved",
    type: "event"
  }
];

const ROYALTY_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "seller", type: "address" },
      { indexed: true, internalType: "address", name: "artisan", type: "address" },
      { indexed: false, internalType: "uint256", name: "transferId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "salePrice", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "artisanAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "sellerAmount", type: "uint256" }
    ],
    name: "RoyaltySettled",
    type: "event"
  }
];

export default function MonitorPage() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("Connecting to live event stream...");
  const [feeds, setFeeds] = useState([]);
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
      const hasProductFeed = Boolean(PRODUCT_REGISTRY_ADDRESS && PRODUCT_REGISTRY_ADDRESS !== "PASTE_ADDRESS_HERE");
      const hasEscrowFeed = Boolean(ESCROW_MARKETPLACE_ADDRESS && ESCROW_MARKETPLACE_ADDRESS !== "PASTE_ADDRESS_HERE");
      const hasRoyaltyFeed = Boolean(DYNAMIC_ROYALTY_ADDRESS && DYNAMIC_ROYALTY_ADDRESS !== "PASTE_ADDRESS_HERE");

      if (!hasProductFeed && !hasEscrowFeed && !hasRoyaltyFeed) {
        setStatus("No contract addresses configured for monitoring.");
        return;
      }

      const pushEvent = (item) => {
        if (!mounted) {
          return;
        }
        setEvents((prev) => {
          const next = [item, ...prev];
          return next.slice(0, 120);
        });
      };

      const withBlockTimestamp = async (log, payload) => {
        const block = await httpClient.getBlock({ blockNumber: log.blockNumber });
        return {
          ...payload,
          time: new Date(Number(block.timestamp) * 1000).toLocaleString(),
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash
        };
      };

      try {
        const activeFeeds = [];
        const unwatchFns = [];

        if (hasProductFeed) {
          const unwatchRegistered = wsClient.watchContractEvent({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            eventName: "ProductRegistered",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":reg",
                  type: "ProductRegistered",
                  source: "ProductRegistry",
                  hash: log.args.productHash
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus("Live stream error. Check WS endpoint or contract addresses.");
            }
          });

          const unwatchTransferred = wsClient.watchContractEvent({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            eventName: "ProductTransferred",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":xfer",
                  type: "ProductTransferred",
                  source: "ProductRegistry",
                  hash: log.args.productHash,
                  from: log.args.from,
                  to: log.args.to,
                  count: Number(log.args.transferCount)
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus("Live stream error. Check WS endpoint or contract addresses.");
            }
          });

          unwatchFns.push(unwatchRegistered, unwatchTransferred);
          activeFeeds.push("ProductRegistry");
        }

        if (hasEscrowFeed) {
          const escrowEventNames = [
            "EscrowCreated",
            "EscrowShipped",
            "EscrowCompleted",
            "EscrowRefunded",
            "EscrowDisputed",
            "EscrowResolved"
          ];

          for (const eventName of escrowEventNames) {
            const unwatchEscrowEvent = wsClient.watchContractEvent({
              address: ESCROW_MARKETPLACE_ADDRESS,
              abi: ESCROW_EVENTS_ABI,
              eventName,
              onLogs: async (logs) => {
                for (const log of logs) {
                  const args = log.args || {};
                  const base = {
                    id: String(log.transactionHash) + ":" + String(log.logIndex) + ":" + eventName,
                    type: eventName,
                    source: "EscrowMarketplace"
                  };

                  if (eventName === "EscrowCreated") {
                    Object.assign(base, {
                      escrowId: Number(args.escrowId),
                      tokenId: Number(args.tokenId),
                      buyer: args.buyer,
                      seller: args.seller,
                      salePriceEth: formatEther(args.salePrice || 0n)
                    });
                  } else if (eventName === "EscrowShipped") {
                    Object.assign(base, {
                      escrowId: Number(args.escrowId),
                      confirmDeadline: Number(args.confirmDeadline)
                    });
                  } else if (eventName === "EscrowCompleted") {
                    Object.assign(base, {
                      escrowId: Number(args.escrowId),
                      tokenId: Number(args.tokenId),
                      artisanAmountEth: formatEther(args.artisanAmount || 0n),
                      sellerAmountEth: formatEther(args.sellerAmount || 0n)
                    });
                  } else if (eventName === "EscrowRefunded") {
                    Object.assign(base, {
                      escrowId: Number(args.escrowId),
                      buyer: args.buyer,
                      refundEth: formatEther(args.amount || 0n)
                    });
                  } else if (eventName === "EscrowDisputed") {
                    Object.assign(base, {
                      escrowId: Number(args.escrowId),
                      raisedBy: args.raisedBy,
                      reason: args.reason
                    });
                  } else if (eventName === "EscrowResolved") {
                    Object.assign(base, {
                      escrowId: Number(args.escrowId),
                      sellerWins: Boolean(args.sellerWins),
                      resolution: args.resolution
                    });
                  }

                  const item = await withBlockTimestamp(log, base);
                  pushEvent(item);
                }
              },
              onError: () => {
                setStatus("Live stream error. Check WS endpoint or contract addresses.");
              }
            });

            unwatchFns.push(unwatchEscrowEvent);
          }

          activeFeeds.push("EscrowMarketplace");
        }

        if (hasRoyaltyFeed) {
          const unwatchRoyalty = wsClient.watchContractEvent({
            address: DYNAMIC_ROYALTY_ADDRESS,
            abi: ROYALTY_EVENTS_ABI,
            eventName: "RoyaltySettled",
            onLogs: async (logs) => {
              for (const log of logs) {
                const args = log.args || {};
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":RoyaltySettled",
                  type: "RoyaltySettled",
                  source: "DynamicRoyalty",
                  tokenId: Number(args.tokenId),
                  transferId: Number(args.transferId),
                  seller: args.seller,
                  artisan: args.artisan,
                  salePriceEth: formatEther(args.salePrice || 0n),
                  artisanAmountEth: formatEther(args.artisanAmount || 0n),
                  sellerAmountEth: formatEther(args.sellerAmount || 0n)
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus("Live stream error. Check WS endpoint or contract addresses.");
            }
          });

          unwatchFns.push(unwatchRoyalty);
          activeFeeds.push("DynamicRoyalty");
        }

        unsubRef.current = unwatchFns;
        setFeeds(activeFeeds);
        setStatus("Live stream connected.");
      } catch (_error) {
        setStatus("Could not connect to websocket stream.");
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

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Live Monitor</h1>
      <p style={{ margin: 0, color: "#466" }}>
        Unified realtime lifecycle stream for registration, transfer, escrow, disputes, and settlement.
      </p>
      <p style={{ margin: 0, color: "#355", fontWeight: 700 }}>{status}</p>
      {feeds.length > 0 && (
        <p style={{ margin: 0, color: "#55756c" }}>
          Active feeds: {feeds.join(", ")}
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {events.length === 0 && (
          <div style={cardStyle}>No events yet. Trigger register, transfer, escrow, or settlement flows to populate timeline.</div>
        )}

        {events.map((event) => (
          <div key={event.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: "#1f6d50" }}>{event.type}</strong>
              <span style={{ color: "#55756c" }}>{event.time}</span>
            </div>
            <div style={{ color: "#55756c", fontSize: 13 }}>Source: {event.source}</div>
            {event.hash && <div style={monoText}>Product Hash: {event.hash}</div>}
            {typeof event.escrowId === "number" && <div style={{ color: "#355" }}>Escrow ID: {event.escrowId}</div>}
            {typeof event.tokenId === "number" && <div style={{ color: "#355" }}>Token ID: {event.tokenId}</div>}
            {event.from && <div style={monoText}>From: {event.from}</div>}
            {event.to && <div style={monoText}>To: {event.to}</div>}
            {event.buyer && <div style={monoText}>Buyer: {event.buyer}</div>}
            {event.seller && <div style={monoText}>Seller: {event.seller}</div>}
            {event.raisedBy && <div style={monoText}>Raised By: {event.raisedBy}</div>}
            {event.artisan && <div style={monoText}>Artisan: {event.artisan}</div>}
            {typeof event.count === "number" && <div style={{ color: "#355" }}>Transfer Count: {event.count}</div>}
            {typeof event.transferId === "number" && <div style={{ color: "#355" }}>Transfer ID: {event.transferId}</div>}
            {event.salePriceEth && <div style={{ color: "#355" }}>Sale Price: {event.salePriceEth} ETH</div>}
            {event.refundEth && <div style={{ color: "#355" }}>Refund: {event.refundEth} ETH</div>}
            {event.artisanAmountEth && <div style={{ color: "#355" }}>Artisan Amount: {event.artisanAmountEth} ETH</div>}
            {event.sellerAmountEth && <div style={{ color: "#355" }}>Seller Amount: {event.sellerAmountEth} ETH</div>}
            {typeof event.sellerWins === "boolean" && (
              <div style={{ color: "#355" }}>Resolution: {event.sellerWins ? "Seller wins" : "Buyer wins"}</div>
            )}
            {event.reason && <div style={{ color: "#355" }}>Reason: {event.reason}</div>}
            {event.resolution && <div style={{ color: "#355" }}>Resolution Notes: {event.resolution}</div>}
            <a href={"https://sepolia.etherscan.io/tx/" + event.txHash} target="_blank" rel="noreferrer" style={linkStyle}>
              View tx
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 6
};

const monoText = {
  color: "#355",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  wordBreak: "break-all"
};

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};
