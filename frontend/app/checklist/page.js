import Link from "next/link";

const checklistItems = [
  { 
    label: "1. Register as Artisan", 
    href: "/artisan",
    description: "Create your verified artisan identity with Anon Aadhaar"
  },
  { 
    label: "2. Register a Product", 
    href: "/register-product",
    description: "Upload product proof and anchor it on-chain"
  },
  { 
    label: "3. Transfer Product", 
    href: "/transfer",
    description: "Transfer ownership with automatic royalty payments"
  },
  { 
    label: "4. Verify Product", 
    href: "/verify",
    description: "Check authenticity and view the chain of custody"
  },
  { 
    label: "5. Attack Demo", 
    href: "/verify",
    description: "See how unverified handlers affect the authenticity score"
  },
  { 
    label: "6. Live Monitor", 
    href: "/monitor",
    description: "Watch real-time blockchain events"
  },
  { 
    label: "7. Evidence Log", 
    href: "/evidence",
    description: "Review all demo transactions for judges"
  }
];

export default function ChecklistPage() {
  return (
    <section style={{ display: "grid", gap: "var(--space-lg)" }}>
      <div>
        <h1 className="page-title">Demo Checklist</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>
          Follow these steps to demonstrate Pramaan's full capabilities.
        </p>
      </div>

      <div style={{ display: "grid", gap: "var(--space-md)" }}>
        {checklistItems.map((item) => (
          <Link 
            key={item.href + item.label} 
            href={item.href}
            style={{ textDecoration: "none" }}
          >
            <div 
              className="card-base"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-md)",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                cursor: "pointer"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-primary)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(29, 158, 117, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "var(--color-primary-dark)", marginBottom: "var(--space-xs)" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
                  {item.description}
                </div>
              </div>
              <div style={{ color: "var(--color-primary)", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M7 5L12 10L7 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card-base" style={{ background: "var(--color-info-bg)", borderColor: "var(--color-info-border)" }}>
        <p style={{ margin: 0, color: "var(--color-info)", fontSize: 14 }}>
          <strong>Tip:</strong> After completing the demo, visit the Evidence page to export a summary of all transactions for judges.
        </p>
      </div>
    </section>
  );
}
