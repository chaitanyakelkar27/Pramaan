import Link from "next/link";
import Providers from "./providers";
import "./globals.css";

export const metadata = {
  title: "Pramaan - Sovereign Traceability for Indian Craft",
  description: "Verify authenticity, prove origin, and receive fair royalties through privacy-preserving identity and on-chain provenance."
};

export const viewport = {
  themeColor: "#1D9E75",
  width: "device-width",
  initialScale: 1
};

const navItems = [
  { href: "/artisan", label: "Artisan" },
  { href: "/register-product", label: "Register" },
  { href: "/verify", label: "Verify" },
  { href: "/transfer", label: "Transfer" }
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "var(--color-surface)",
            borderBottom: "1px solid var(--color-border)"
          }}
        >
          <nav
            style={{
              maxWidth: "var(--container-max)",
              margin: "0 auto",
              padding: "var(--space-md) var(--space-xl)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-lg)",
              flexWrap: "wrap",
              minHeight: 56
            }}
          >
            {/* Brand Section */}
            <div 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "var(--space-md)",
                flexShrink: 0
              }}
            >
              <Link 
                href="/" 
                style={{ 
                  textDecoration: "none", 
                  color: "var(--color-primary)", 
                  fontWeight: 800, 
                  fontSize: 22,
                  lineHeight: 1
                }}
                aria-label="Pramaan - Home"
              >
                Pramaan
              </Link>
              <span 
                style={{ 
                  color: "var(--color-text-secondary)", 
                  fontSize: 13,
                  display: "none"
                }}
                className="brand-tagline"
              >
                Sovereign Traceability
              </span>
            </div>

            {/* Navigation Links */}
            <div 
              style={{ 
                display: "flex", 
                gap: "var(--space-sm)", 
                flexWrap: "wrap",
                alignItems: "center"
              }}
              role="navigation"
              aria-label="Main navigation"
            >
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: "none",
                    color: "var(--color-primary-dark)",
                    background: "var(--color-primary-light)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-full)",
                    padding: "var(--space-sm) var(--space-md)",
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    transition: "background-color 0.15s ease"
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <Providers>
          <main 
            style={{ 
              maxWidth: "var(--container-max)", 
              margin: "0 auto", 
              padding: "var(--space-2xl) var(--space-xl) var(--space-4xl)"
            }}
          >
            {children}
          </main>
        </Providers>

        <style jsx global>{`
          @media (min-width: 768px) {
            .brand-tagline {
              display: inline !important;
            }
          }
          
          @media (max-width: 480px) {
            nav {
              padding: var(--space-sm) var(--space-md) !important;
              gap: var(--space-sm) !important;
            }
            
            nav > div:last-child {
              width: 100%;
              justify-content: center;
            }
            
            nav > div:last-child a {
              flex: 1;
              text-align: center;
              min-width: 0;
              padding: var(--space-sm) var(--space-sm) !important;
              font-size: 13px !important;
            }
          }
        `}</style>
      </body>
    </html>
  );
}
