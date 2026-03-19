import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getSkillIndex } from "../api";
import type { SkillIndexEntry } from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { t } from "../i18n";

// ── Category colors (same palette as SkillGraph) ─────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Frontend: "#61dafb",
  Backend: "#68d391",
  DevOps: "#f6ad55",
  AI: "#e91e63",
  Database: "#805ad5",
  Mobile: "#fc8181",
  Security: "#4fd1c5",
  Testing: "#f687b3",
  Tools: "#a0aec0",
  Other: "#cbd5e0",
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#E91E63";
}

// ── Radar chart SVG generation ───────────────────────────────────────────────

interface CategoryData {
  name: string;
  total: number;
  mastered: number;
  learning: number;
}

function buildRadarPoints(
  categories: CategoryData[],
  cx: number,
  cy: number,
  radius: number,
  accessor: (c: CategoryData) => number,
  maxValue: number,
): string {
  if (categories.length === 0) return "";
  const angleStep = (2 * Math.PI) / categories.length;
  return categories
    .map((cat, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const value = maxValue > 0 ? accessor(cat) / maxValue : 0;
      const r = value * radius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");
}

function RadarChart({
  categories,
  width = 400,
  height = 400,
}: {
  categories: CategoryData[];
  width?: number;
  height?: number;
}) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 60;
  const rings = 4;
  const angleStep = categories.length > 0 ? (2 * Math.PI) / categories.length : 0;
  const maxValue = Math.max(...categories.map((c) => c.total), 1);

  return (
    <g>
      {/* Concentric rings */}
      {Array.from({ length: rings }, (_, i) => {
        const r = (radius * (i + 1)) / rings;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#e0e0e0"
            strokeWidth={0.5}
            strokeDasharray={i < rings - 1 ? "2,4" : "none"}
          />
        );
      })}

      {/* Axis lines + labels */}
      {categories.map((cat, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const x2 = cx + radius * Math.cos(angle);
        const y2 = cy + radius * Math.sin(angle);
        const labelR = radius + 24;
        const lx = cx + labelR * Math.cos(angle);
        const ly = cy + labelR * Math.sin(angle);
        return (
          <g key={cat.name}>
            <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#e0e0e0" strokeWidth={0.5} />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontFamily="'JetBrains Mono', 'SF Mono', monospace"
              fontWeight={600}
              fill={getCategoryColor(cat.name)}
            >
              {cat.name}
            </text>
          </g>
        );
      })}

      {/* Total area (outer) */}
      {categories.length >= 3 && (
        <polygon
          points={buildRadarPoints(categories, cx, cy, radius, (c) => c.total, maxValue)}
          fill="rgba(233,30,99,0.08)"
          stroke="#E91E63"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}

      {/* Mastered area (inner, solid) */}
      {categories.length >= 3 && (
        <polygon
          points={buildRadarPoints(categories, cx, cy, radius, (c) => c.mastered, maxValue)}
          fill="rgba(0,184,148,0.2)"
          stroke="#00B894"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}

      {/* Data points */}
      {categories.map((cat, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const value = maxValue > 0 ? cat.total / maxValue : 0;
        const r = value * radius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return (
          <circle
            key={cat.name}
            cx={x}
            cy={y}
            r={4}
            fill="#E91E63"
            stroke="#fff"
            strokeWidth={2}
          />
        );
      })}
    </g>
  );
}

// ── PNG export ───────────────────────────────────────────────────────────────

async function exportSvgToPng(svgElement: SVGSVGElement, filename: string): Promise<boolean> {
  try {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    const scale = 2; // 2x for retina
    const w = svgElement.viewBox.baseVal.width || svgElement.width.baseVal.value;
    const h = svgElement.viewBox.baseVal.height || svgElement.height.baseVal.value;

    return new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(false);
          return;
        }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(false);
            return;
          }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          resolve(true);
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
  } catch {
    return false;
  }
}

function downloadSvg(svgElement: SVGSVGElement, filename: string) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/\.png$/, ".svg");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ── Component ────────────────────────────────────────────────────────────────

const CARD_WIDTH = 480;
const CARD_HEIGHT = 620;

export default function ShareCard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const i = t(language);
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);

  const [skills, setSkills] = useState<SkillIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSkills = useCallback(() => {
    setLoading(true);
    setError(false);
    getSkillIndex()
      .then(({ skills }) => setSkills(skills))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  // Aggregate by category
  const categories = useMemo<CategoryData[]>(() => {
    const map = new Map<string, CategoryData>();
    for (const s of skills) {
      const cat = s.category || "Other";
      const entry = map.get(cat) ?? { name: cat, total: 0, mastered: 0, learning: 0 };
      entry.total++;
      if (s.status === "mastered") entry.mastered++;
      else if (s.status === "learning") entry.learning++;
      map.set(cat, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [skills]);

  const totalSkills = skills.length;
  const mastered = skills.filter((s) => s.status === "mastered").length;
  const learningCount = skills.filter((s) => s.status === "learning").length;
  const planned = totalSkills - mastered - learningCount;

  const handleDownload = async () => {
    if (!svgRef.current) return;
    const success = await exportSvgToPng(svgRef.current, "roadbook-skill-radar.png");
    if (!success) {
      downloadSvg(svgRef.current, "roadbook-skill-radar.svg");
      toast(i.shareCardFallbackSvg, "info");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast(i.shareCardLinkCopied, "success");
    } catch {
      toast(i.shareCardLinkCopyFailed, "error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="flex items-center px-4 md:px-8 py-3 md:py-4 border-b shrink-0"
        style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}
      >
        <span
          className="text-base font-bold gradient-text cursor-pointer"
          style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", letterSpacing: "0.12em" }}
          onClick={() => navigate("/")}
        >
          ROADBOOK
        </span>
        <span className="mx-2 text-xs" style={{ color: "var(--color-text-muted)" }}>/</span>
        <span className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
          {i.shareCardTitle}
        </span>
        <div className="ml-auto">
          <button
            onClick={() => navigate("/")}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-surface)" }}
          >
            {i.back}
          </button>
        </div>
      </header>

      {/* Main content */}
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
          />
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{i.serverUnreachable}</p>
          <button onClick={fetchSkills} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">
            {i.retry}
          </button>
        </div>
      ) : totalSkills === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-lg font-medium" style={{ color: "var(--color-text)" }}>
            {i.shareCardEmptyTitle}
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {i.shareCardEmptyHint}
          </p>
          <button
            onClick={() => navigate("/workspaces")}
            className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium mt-2"
          >
            {i.skillRadarEmptyAction}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-8 px-4">
          {/* Card preview */}
          <div
            className="rounded-2xl shadow-lg mb-6"
            style={{
              background: "#fff",
              border: "1px solid var(--color-border)",
              width: CARD_WIDTH,
              maxWidth: "100%",
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "block", maxWidth: "100%", height: "auto" }}
            >
              {/* Background */}
              <rect width={CARD_WIDTH} height={CARD_HEIGHT} rx={16} fill="#FAFAFA" />
              <rect width={CARD_WIDTH} height={CARD_HEIGHT} rx={16} fill="none" stroke="#e0e0e0" strokeWidth={1} />

              {/* Title */}
              <text
                x={CARD_WIDTH / 2}
                y={38}
                textAnchor="middle"
                fontSize={14}
                fontWeight={700}
                fontFamily="'JetBrains Mono', 'SF Mono', monospace"
                letterSpacing="0.15em"
                fill="#1a1a1a"
              >
                ROADBOOK SKILL RADAR
              </text>

              {/* Radar chart */}
              <RadarChart categories={categories} width={CARD_WIDTH} height={380} />

              {/* Stats section — shifted down to account for chart offset */}
              <g transform={`translate(0, 390)`}>
                {/* Mastered */}
                <circle cx={60} cy={16} r={5} fill="#00B894" />
                <text x={72} y={20} fontSize={13} fontFamily="'JetBrains Mono', 'SF Mono', monospace" fill="#1a1a1a">
                  {mastered} {i.shareCardMastered}
                </text>

                {/* Learning */}
                <circle cx={60} cy={42} r={5} fill="none" stroke="#FDCB6E" strokeWidth={2} />
                <text x={72} y={46} fontSize={13} fontFamily="'JetBrains Mono', 'SF Mono', monospace" fill="#1a1a1a">
                  {learningCount} {i.shareCardLearning}
                </text>

                {/* Planned */}
                <circle cx={60} cy={68} r={3} fill="#ccc" />
                <text x={72} y={72} fontSize={13} fontFamily="'JetBrains Mono', 'SF Mono', monospace" fill="#1a1a1a">
                  {planned} {i.shareCardPlanned}
                </text>

                {/* Total badge */}
                <text
                  x={CARD_WIDTH - 60}
                  y={46}
                  textAnchor="middle"
                  fontSize={36}
                  fontWeight={700}
                  fontFamily="'JetBrains Mono', 'SF Mono', monospace"
                  fill="#E91E63"
                >
                  {totalSkills}
                </text>
                <text
                  x={CARD_WIDTH - 60}
                  y={68}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="'JetBrains Mono', 'SF Mono', monospace"
                  fill="#999"
                >
                  {i.shareCardTotalSkills}
                </text>
              </g>

              {/* Watermark */}
              <text
                x={CARD_WIDTH / 2}
                y={CARD_HEIGHT - 18}
                textAnchor="middle"
                fontSize={10}
                fontFamily="'JetBrains Mono', 'SF Mono', monospace"
                letterSpacing="0.1em"
                fill="#bbb"
              >
                Generated by ROADBOOK
              </text>
            </svg>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="btn-gradient px-6 py-2.5 rounded-lg text-sm font-medium"
            >
              {i.shareCardDownload}
            </button>
            <button
              onClick={handleCopyLink}
              className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                background: "var(--color-surface)",
              }}
            >
              {i.shareCardCopyLink}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
