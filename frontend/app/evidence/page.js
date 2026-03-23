"use client";

import { useEffect, useState } from "react";
import { clearEvidence, loadEvidence, toMarkdown } from "../../src/utils/evidence";
import StatusMessage from "../../components/StatusMessage";

export default function EvidencePage() {
  const [evidence, setEvidence] = useState({ network: "sepolia", generatedAt: "", entries: [] });
  const [message, setMessage] = useState({ type: "", text: "" });

  function refresh() {
    setEvidence(loadEvidence());
    setMessage({ type: "success", text: "Evidence refreshed." });
    setTimeout(() => setMessage({ type: "", text: "" }), 2000);
  }

  useEffect(() => {
    setEvidence(loadEvidence());
  }, []);

  async function copyMarkdown() {
    const markdown = toMarkdown(evidence);
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage({ type: "success", text: "Evidence exported to clipboard as Markdown. Paste it anywhere to share." });
    } catch (_error) {
      setMessage({ type: "error", text: "Could not copy to clipboard. Please try again." });
    }
  }

  function onClear() {
    if (window.confirm("Are you sure you want to clear all evidence? This cannot be undone.")) {
      clearEvidence();
      setEvidence(loadEvidence());
      setMessage({ type: "info", text: "All evidence entries have been cleared." });
    }
  }

  function truncateHash(hash) {
    if (!hash || hash.length < 20) {
      return hash || "-";
    }
    return hash.slice(0, 10) + "..." + hash.slice(-6);
  }

  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Demo Evidence</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          A complete log of all transactions performed during the demo. Export this for judges or documentation.
        </p>
      </div>

      {/* Metadata */}
      <div className="card-base form-container">
        <div style={{ display: "grid", gap: "var(--space-xs)" }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Network:</strong> {evidence.network}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Session Started:</strong> {evidence.generatedAt || "No activity yet"}
          </p>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            <strong>Total Entries:</strong> {evidence.entries.length}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <button type="button" onClick={refresh} className="btn-base btn-secondary">
          Refresh
        </button>
        <button type="button" onClick={copyMarkdown} className="btn-base btn-primary">
          Export as Markdown
        </button>
        <button type="button" onClick={onClear} className="btn-base btn-danger">
          Clear All
        </button>
      </div>

      {/* Status Message */}
      {message.text && (
        <div className="form-container">
          <StatusMessage type={message.type || "info"} message={message.text} />
        </div>
      )}

      {/* Evidence Entries */}
      <div style={{ display: "grid", gap: "var(--space-md)" }}>
        {evidence.entries.length === 0 && (
          <div className="card-base" style={{ textAlign: "center", padding: "var(--space-2xl)" }}>
            <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
              No evidence entries yet. Complete artisan registration, product registration, or transfers to generate evidence.
            </p>
          </div>
        )}

        {evidence.entries.map((item) => (
          <div 
            key={item.id} 
            className="card-base"
            style={{ 
              borderLeft: `4px solid ${
                item.action === "Transfer" ? "var(--color-primary)" : 
                item.action === "Registration" ? "var(--color-success)" : 
                "var(--color-info)"
              }` 
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-md)", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12,
                  fontWeight: 700,
                  background: item.action === "Transfer" ? "var(--color-info-bg)" : 
                             item.action === "Registration" ? "var(--color-success-bg)" : 
                             "var(--color-warning-bg)",
                  color: item.action === "Transfer" ? "var(--color-info)" : 
                         item.action === "Registration" ? "var(--color-success)" : 
                         "var(--color-warning)"
                }}
              >
                {item.action}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{item.timestamp}</span>
            </div>

            <div style={{ display: "grid", gap: "var(--space-xs)", marginTop: "var(--space-md)" }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                <strong>Product Hash:</strong>{" "}
                <span style={{ fontFamily: "var(--font-mono)" }}>{truncateHash(item.productHash)}</span>
              </p>
              
              {item.txUrl && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                  <strong>Transaction:</strong>{" "}
                  <a href={item.txUrl} target="_blank" rel="noreferrer" className="link-primary">
                    View on Etherscan
                  </a>
                </p>
              )}
              
              {item.notes && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                  <strong>Notes:</strong> {item.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
