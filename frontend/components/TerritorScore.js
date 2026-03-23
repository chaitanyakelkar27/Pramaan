"use client";

import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";

function getScoreMeta(rawScore) {
  const score = Math.max(0, Math.min(100, Number(rawScore) || 0));

  if (score >= 80) {
    return {
      score,
      status: "Authentic",
      color: "#16794d",
      bg: "#d8f5e7"
    };
  }

  if (score >= 50) {
    return {
      score,
      status: "Caution",
      color: "#8b5a00",
      bg: "#fff0cc"
    };
  }

  return {
    score,
    status: "Compromised",
    color: "#8a1f1f",
    bg: "#ffe0e0"
  };
}

export default function TerritorScore({ score }) {
  const meta = getScoreMeta(score);

  return (
    <Card className="border-[#d8e9e2]">
      <CardContent className="grid gap-4 p-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: meta.bg,
              color: meta.color,
              border: "2px solid " + meta.color,
              fontWeight: 800,
              fontSize: 22
            }}
          >
            {meta.score}
          </div>
          <div className="grid gap-1">
            <div className="text-sm text-[#49665e]">Terroir Score</div>
            <div className="text-[1.2rem] font-bold" style={{ color: meta.color }}>{meta.status}</div>
            <Badge variant="neutral" className="w-fit">Live Integrity Signal</Badge>
          </div>
        </div>

        <div>
          <div
            style={{
              width: "100%",
              height: 12,
              borderRadius: 999,
              background: "#edf5f2",
              overflow: "hidden",
              border: "1px solid #d8e8e2"
            }}
          >
            <div
              style={{
                width: meta.score + "%",
                height: "100%",
                background: meta.color,
                transition: "width 240ms ease"
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
