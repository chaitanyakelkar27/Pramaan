"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Demo data ───────────────────────────────────────────────── */
const features = [
  {
    color: "#0d9488",
    bg: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
    icon: "🛡️",
    title: "Proof of Craft",
    desc: "Only verified artisans can register products. AI-verified at the source.",
  },
  {
    color: "#7c3aed",
    bg: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)",
    icon: "🔗",
    title: "Soulbound Identity",
    desc: "Artisan identity is permanently tied to every product. Cannot be transferred or faked.",
  },
  {
    color: "#d97706",
    bg: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
    icon: "📊",
    title: "Terroir Score",
    desc: "A live 0–100 trust score that degrades the moment a fake handler touches the supply chain.",
  },
];

const demoProducts = [
  { name: "First Flush Darjeeling 2024", terroir: 97, artisan: "Ravi Kumar" },
  { name: "Banarasi Silk Saree — Crimson", terroir: 84, artisan: "Meera Devi" },
  { name: "Alphonso Mango Batch 12", terroir: 61, artisan: "Suresh Patil" },
];

const stats = [
  { value: "2,847", label: "Products Registered" },
  { value: "891", label: "Verified Artisans" },
  { value: "14", label: "GI Tags Covered" },
];

/* ── Terroir Score ring ──────────────────────────────────────── */
function TerroirScore({ score }) {
  const size = 72;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const color =
    score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
            transition: "stroke-dashoffset 1s ease",
          }}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 18,
          color,
        }}
      >
        {score}
      </span>
    </div>
  );
}

/* ── Page component ──────────────────────────────────────────── */
export default function HomePage() {
  const [hash, setHash] = useState("");
  const router = useRouter();

  const handleVerify = (e) => {
    e.preventDefault();
    if (hash.trim()) router.push(`/verify?hash=${encodeURIComponent(hash.trim())}`);
    else router.push("/verify");
  };

  return (
    <>
      <style>{`
        /* ── keyframes ─────────────────────────────────── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,.35); }
          50%      { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
        }

        /* ── hero ──────────────────────────────────────── */
        .hero {
          text-align: center;
          padding: 64px 0 48px;
          animation: fadeUp .7s ease both;
        }
        .hero h1 {
          margin: 0 0 14px;
          font-size: 42px;
          font-weight: 900;
          color: #0f2e26;
          line-height: 1.15;
          letter-spacing: -0.5px;
        }
        .hero h1 span { color: #10b981; }
        .hero p {
          margin: 0 auto 32px;
          max-width: 600px;
          font-size: 17px;
          color: #4b6b63;
          line-height: 1.6;
        }

        /* ── search bar ────────────────────────────────── */
        .search-bar {
          display: flex;
          max-width: 580px;
          margin: 0 auto;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,.08);
        }
        .search-bar input {
          flex: 1;
          border: 2px solid #d1e8e0;
          border-right: none;
          border-radius: 14px 0 0 14px;
          padding: 16px 20px;
          font-size: 15px;
          outline: none;
          background: #fff;
          color: #163f36;
          transition: border-color .2s;
        }
        .search-bar input:focus { border-color: #10b981; }
        .search-bar input::placeholder { color: #8fafa5; }
        .search-bar button {
          border: none;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          padding: 16px 28px;
          cursor: pointer;
          white-space: nowrap;
          transition: filter .2s;
          animation: pulse 2.5s infinite;
        }
        .search-bar button:hover { filter: brightness(1.08); }

        /* ── section titles ────────────────────────────── */
        .section-title {
          text-align: center;
          font-size: 28px;
          font-weight: 800;
          color: #0f2e26;
          margin: 0 0 8px;
        }
        .section-sub {
          text-align: center;
          color: #5a7b72;
          margin: 0 0 32px;
          font-size: 15px;
        }

        /* ── feature cards ─────────────────────────────── */
        .features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 20px;
          margin-bottom: 56px;
          animation: fadeUp .8s ease both;
          animation-delay: .15s;
        }
        .feature-card {
          border-radius: 16px;
          padding: 32px 26px;
          color: #fff;
          position: relative;
          overflow: hidden;
          transition: transform .25s, box-shadow .25s;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(0,0,0,.18);
        }
        .feature-card .icon {
          font-size: 36px;
          margin-bottom: 12px;
          display: block;
        }
        .feature-card h3 {
          margin: 0 0 8px;
          font-size: 20px;
          font-weight: 800;
        }
        .feature-card p {
          margin: 0;
          font-size: 14px;
          line-height: 1.55;
          opacity: .92;
        }

        /* ── product cards ─────────────────────────────── */
        .products {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-bottom: 56px;
          animation: fadeUp .8s ease both;
          animation-delay: .3s;
        }
        .product-card {
          background: #fff;
          border: 1px solid #dceee7;
          border-radius: 16px;
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          transition: transform .25s, box-shadow .25s;
        }
        .product-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 28px rgba(0,0,0,.08);
        }
        .product-card h4 {
          margin: 0;
          font-size: 17px;
          font-weight: 700;
          color: #0f2e26;
          text-align: center;
        }
        .product-card .artisan {
          font-size: 13px;
          color: #5a7b72;
        }
        .product-card .btn-prov {
          margin-top: auto;
          display: inline-block;
          text-decoration: none;
          background: #e8f5f1;
          color: #0d7a5f;
          font-weight: 700;
          font-size: 13px;
          padding: 9px 18px;
          border-radius: 10px;
          border: 1px solid #b7ded0;
          transition: background .2s, color .2s;
        }
        .product-card .btn-prov:hover {
          background: #10b981;
          color: #fff;
          border-color: #10b981;
        }

        /* ── stats bar ─────────────────────────────────── */
        .stats-bar {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 0;
          background: linear-gradient(135deg, #0f2e26 0%, #164e3f 100%);
          border-radius: 16px;
          padding: 32px 24px;
          animation: fadeUp .8s ease both;
          animation-delay: .45s;
          margin-bottom: 24px;
        }
        .stat-item {
          flex: 1 1 180px;
          text-align: center;
          padding: 8px 16px;
          position: relative;
        }
        .stat-item:not(:last-child)::after {
          content: '';
          position: absolute;
          right: 0;
          top: 15%;
          height: 70%;
          width: 1px;
          background: rgba(255,255,255,.18);
        }
        .stat-value {
          font-size: 32px;
          font-weight: 900;
          color: #34d399;
          display: block;
        }
        .stat-label {
          font-size: 13px;
          color: rgba(255,255,255,.7);
          margin-top: 4px;
          display: block;
        }

        @media (max-width: 600px) {
          .hero h1 { font-size: 28px; }
          .search-bar { flex-direction: column; border-radius: 14px; }
          .search-bar input { border-right: 2px solid #d1e8e0; border-radius: 14px 14px 0 0; }
          .search-bar button { border-radius: 0 0 14px 14px; }
          .stat-item:not(:last-child)::after { display: none; }
        }
      `}</style>

      {/* ── HERO ──────────────────────────────────────── */}
      <section className="hero">
        <h1>
          Is your product <span>really</span> from<br />where it claims?
        </h1>
        <p>
          Scan any Parampara-registered product to verify its origin, trace its
          journey, and see its live Terroir Score.
        </p>
        <form className="search-bar" onSubmit={handleVerify}>
          <input
            type="text"
            placeholder="Enter product hash or scan QR code"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
          />
          <button type="submit">Verify Now</button>
        </form>
      </section>

      {/* ── FEATURES ──────────────────────────────────── */}
      <h2 className="section-title">Why Parampara?</h2>
      <p className="section-sub">Three pillars that make craft fraud impossible.</p>
      <div className="features">
        {features.map((f) => (
          <div
            key={f.title}
            className="feature-card"
            style={{ background: f.bg }}
          >
            <span className="icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* ── DEMO PRODUCTS ─────────────────────────────── */}
      <h2 className="section-title">Recently Registered</h2>
      <p className="section-sub">Live products on the Parampara ledger.</p>
      <div className="products">
        {demoProducts.map((p) => (
          <div key={p.name} className="product-card">
            <TerroirScore score={p.terroir} />
            <h4>{p.name}</h4>
            <span className="artisan">Artisan: {p.artisan}</span>
            <Link href="/verify" className="btn-prov">
              View Full Provenance →
            </Link>
          </div>
        ))}
      </div>

      {/* ── STATS BAR ─────────────────────────────────── */}
      <div className="stats-bar">
        {stats.map((s) => (
          <div key={s.label} className="stat-item">
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
