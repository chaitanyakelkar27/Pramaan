"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TerritorScore from "../components/TerritorScore";

const featureCards = [
  {
    title: "Proof of Craft",
    desc: "Only verified artisans can register products. AI-verified at the source.",
    className: "teal"
  },
  {
    title: "Soulbound Identity",
    desc: "Artisan identity is permanently tied to every product. Cannot be transferred or faked.",
    className: "purple"
  },
  {
    title: "Terroir Score",
    desc: "A live 0-100 trust score that degrades the moment a fake handler touches the supply chain.",
    className: "amber"
  }
];

const demoProducts = [
  { name: "First Flush Darjeeling 2024", terroir: 97, artisan: "Ravi Kumar" },
  { name: "Banarasi Silk Saree — Crimson", terroir: 84, artisan: "Meera Devi" },
  { name: "Alphonso Mango Batch 12", terroir: 61, artisan: "Suresh Patil" }
];

export default function HomePage() {
  const [hash, setHash] = useState("");
  const router = useRouter();

  function onVerify(event) {
    event.preventDefault();
    const cleanHash = hash.trim();
    router.push("/verify?hash=" + encodeURIComponent(cleanHash));
  }

  return (
    <section className="home-wrap">
      <style>{`
        .home-wrap {
          display: grid;
          gap: 40px;
          padding: 8px 0 30px;
        }

        .hero {
          border: 1px solid #dcebe6;
          border-radius: 22px;
          background:
            radial-gradient(120% 120% at 0% 0%, #d9f7f0 0%, rgba(217, 247, 240, 0) 48%),
            radial-gradient(120% 120% at 100% 100%, #fff4de 0%, rgba(255, 244, 222, 0) 50%),
            #ffffff;
          padding: 42px 20px;
          text-align: center;
        }

        .hero h1 {
          margin: 0;
          color: #11352f;
          font-size: clamp(28px, 5vw, 48px);
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .hero p {
          margin: 14px auto 0;
          max-width: 760px;
          color: #3f5e57;
          font-size: clamp(15px, 2vw, 18px);
          line-height: 1.6;
        }

        .verify-form {
          margin: 26px auto 0;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          max-width: 780px;
          background: #ffffff;
          border: 1px solid #cfe3dc;
          border-radius: 14px;
          padding: 10px;
          box-shadow: 0 10px 28px rgba(18, 63, 54, 0.08);
        }

        .verify-form input {
          border: 1px solid #c9dfd8;
          border-radius: 10px;
          padding: 14px 14px;
          font-size: 15px;
          color: #11352f;
          outline: none;
        }

        .verify-form input:focus {
          border-color: #1ea07a;
          box-shadow: 0 0 0 3px rgba(30, 160, 122, 0.12);
        }

        .verify-form button {
          border: none;
          border-radius: 10px;
          padding: 0 20px;
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          background: linear-gradient(145deg, #1ea07a 0%, #137f60 100%);
          cursor: pointer;
          white-space: nowrap;
        }

        .verify-form button:hover {
          filter: brightness(1.05);
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .feature-card {
          border-radius: 16px;
          color: #ffffff;
          padding: 20px;
          min-height: 160px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 12px 28px rgba(17, 33, 52, 0.12);
        }

        .feature-card h3 {
          margin: 0 0 10px;
          font-size: 21px;
          line-height: 1.2;
        }

        .feature-card p {
          margin: 0;
          line-height: 1.55;
          font-size: 14px;
          opacity: 0.95;
        }

        .feature-card.teal {
          background: linear-gradient(150deg, #0d8e88 0%, #14b8a6 100%);
        }

        .feature-card.purple {
          background: linear-gradient(150deg, #6d3ff2 0%, #9568ff 100%);
        }

        .feature-card.amber {
          background: linear-gradient(150deg, #bc6a08 0%, #e59d1c 100%);
        }

        .section-title {
          margin: 0 0 12px;
          font-size: clamp(24px, 3vw, 32px);
          color: #11352f;
          letter-spacing: -0.01em;
        }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .product-card {
          border: 1px solid #d8e9e2;
          border-radius: 16px;
          padding: 16px;
          background: #ffffff;
          display: grid;
          gap: 12px;
        }

        .product-card h4 {
          margin: 0;
          font-size: 18px;
          color: #163d35;
          line-height: 1.35;
        }

        .artisan-name {
          margin: 0;
          color: #4a685f;
          font-size: 14px;
        }

        .prov-btn {
          display: inline-block;
          text-decoration: none;
          border: 1px solid #bfdcd1;
          border-radius: 10px;
          padding: 10px 12px;
          background: #edf8f4;
          color: #125f47;
          font-weight: 700;
          font-size: 14px;
        }

        .prov-btn:hover {
          background: #dbf2e9;
        }

        .stats-bar {
          border: 1px solid #cfe3dc;
          border-radius: 14px;
          background: linear-gradient(120deg, #143d34 0%, #1c5648 100%);
          color: #e2f7ef;
          text-align: center;
          font-size: clamp(15px, 2.6vw, 19px);
          font-weight: 700;
          padding: 18px 14px;
          line-height: 1.5;
        }

        @media (max-width: 980px) {
          .feature-grid,
          .product-grid {
            grid-template-columns: 1fr;
          }

          .verify-form {
            grid-template-columns: 1fr;
          }

          .verify-form button {
            padding: 12px;
          }
        }
      `}</style>

      <div className="hero">
        <h1>Is your product really from where it claims?</h1>
        <p>
          Scan any Pramaan-registered product to verify its origin,
          trace its journey, and see its live Terroir Score.
        </p>

        <form className="verify-form" onSubmit={onVerify}>
          <input
            type="text"
            placeholder="Enter product hash or scan QR code"
            value={hash}
            onChange={(event) => setHash(event.target.value)}
          />
          <button type="submit">Verify Now</button>
        </form>
      </div>

      <div>
        <h2 className="section-title">Why Pramaan Works</h2>
        <div className="feature-grid">
          {featureCards.map((card) => (
            <article key={card.title} className={"feature-card " + card.className}>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
            </article>
          ))}
        </div>
      </div>

      <div>
        <h2 className="section-title">Demo Registered Products</h2>
        <div className="product-grid">
          {demoProducts.map((product) => (
            <article key={product.name} className="product-card">
              <h4>{product.name}</h4>
              <p className="artisan-name">Artisan: {product.artisan}</p>
              <TerritorScore score={product.terroir} />
              <Link href="/verify" className="prov-btn">
                View Full Provenance
              </Link>
            </article>
          ))}
        </div>
      </div>

      <div className="stats-bar">
        2,847 Products Registered  |  891 Verified Artisans  |  14 GI Tags Covered
      </div>
    </section>
  );
}
