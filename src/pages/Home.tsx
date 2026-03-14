import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listWorkspaces, createWorkspace, deleteWorkspace } from "../api";
import type { WorkspaceListItem } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { t, LANGUAGES } from "../i18n";

const CARD_GRADIENTS = [
  "linear-gradient(135deg, #c4b9f8, #a5b4fc)",
  "linear-gradient(135deg, #a5c8f0, #c4b9f8)",
  "linear-gradient(135deg, #a7d9c8, #a5c8f0)",
  "linear-gradient(135deg, #f5c9a0, #f0a8b8)",
  "linear-gradient(135deg, #f0a8b8, #c4b9f8)",
  "linear-gradient(135deg, #a5c8f0, #9dc8b8)",
  "linear-gradient(135deg, #c4e0a8, #a7d9c8)",
  "linear-gradient(135deg, #f8d0a8, #c4b9f8)",
];

function cardGradient(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-CA");
}

export default function Home() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const i = t(language);
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listWorkspaces().then(setWorkspaces).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const handleNew = async () => {
    setCreating(true);
    try {
      const ws = await createWorkspace();
      navigate(`/workspace/${ws.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteWorkspace(id);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    setMenuId(null);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="flex items-center px-8 py-4 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="text-xl font-bold gradient-text">Roadbook</span>
        <span className="ml-2 text-sm" style={{ color: "var(--color-text-muted)" }}>路书</span>
        <div className="ml-auto">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-10">
        {loading ? (
          <div className="flex justify-center pt-32">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
          </div>
        ) : (
          <>
            {/* Hero - only when empty */}
            {workspaces.length === 0 && (
              <HeroSection i={i} creating={creating} onNew={handleNew} />
            )}

            {/* Section header */}
            {workspaces.length > 0 && (
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
                  {i.myJourneys}
                </h2>
                <button
                  onClick={handleNew}
                  disabled={creating}
                  className="btn-gradient px-4 py-2 rounded-lg text-sm font-medium"
                >
                  {creating ? i.creating : i.newJourney}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {workspaces.map((ws) => (
                <WorkspaceCard
                  key={ws.id}
                  ws={ws}
                  gradient={cardGradient(ws.id)}
                  menuOpen={menuId === ws.id}
                  onOpen={() => navigate(`/workspace/${ws.id}`)}
                  onMenuToggle={(e) => {
                    e.stopPropagation();
                    setMenuId(menuId === ws.id ? null : ws.id);
                  }}
                  onDelete={(e) => handleDelete(ws.id, e)}
                  i={i}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const PUNCTUATION = new Set(["，", "。", ",", ".", "·", "、", "。", "！", "？"]);

function HeroSection({ i, creating, onNew }: { i: ReturnType<typeof t>; creating: boolean; onNew: () => void }) {
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const [showCta, setShowCta] = useState(false);

  const slogan = i.homeTagline;

  useEffect(() => {
    setTyped(""); setDone(false); setShowSub(false); setShowCta(false);
    let idx = 0;
    const start = setTimeout(() => {
      const tick = setInterval(() => {
        idx++;
        setTyped(slogan.slice(0, idx));
        if (idx >= slogan.length) {
          clearInterval(tick);
          setDone(true);
          setTimeout(() => setShowSub(true), 300);
          setTimeout(() => setShowCta(true), 700);
        }
      }, 60);
      return () => clearInterval(tick);
    }, 500);
    return () => clearTimeout(start);
  }, [slogan]);

  return (
    <div className="text-center relative" style={{ padding: "80px 0 64px" }}>
      {/* Thin top rule */}
      <div style={{
        position: "absolute", top: 0, left: "50%",
        transform: "translateX(-50%)",
        width: 40, height: 1,
        background: "var(--color-accent)", opacity: 0.4,
      }} />

      {/* Brand label */}
      <div className="anim-fade-up" style={{ marginBottom: 32 }}>
        <span style={{
          fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
          color: "var(--color-accent)", fontWeight: 600, opacity: 0.8,
        }}>
          Roadbook &nbsp;·&nbsp; 路书
        </span>
      </div>

      {/* Main hero: huge typewriter slogan */}
      <h1 style={{
        fontSize: "clamp(44px, 7vw, 76px)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.15,
        color: "var(--color-text)",
        margin: "0 0 28px",
        minHeight: "1.2em",
      }}>
        {typed.split("").map((char, idx) => (
          <span key={idx} style={{
            color: PUNCTUATION.has(char) ? "var(--color-accent)" : "inherit",
            opacity: 1,
          }}>
            {char}
          </span>
        ))}
        {!done && <span className="cursor-blink" />}
      </h1>

      {/* English subtitle — fades in after typing */}
      <p style={{
        fontSize: 15,
        color: "var(--color-text-muted)",
        letterSpacing: "0.04em",
        marginBottom: 48,
        opacity: showSub ? 0.7 : 0,
        transform: showSub ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}>
        Every journey has its source.
      </p>

      {/* CTA */}
      <div style={{
        opacity: showCta ? 1 : 0,
        transform: showCta ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}>
        <button
          onClick={onNew}
          disabled={creating}
          className="hero-btn"
        >
          {creating ? i.creating : i.createFirst}
        </button>
      </div>
    </div>
  );
}

function WorkspaceCard({
  ws,
  gradient,
  menuOpen,
  onOpen,
  onMenuToggle,
  onDelete,
  i,
}: {
  ws: WorkspaceListItem;
  gradient: string;
  menuOpen: boolean;
  onOpen: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  i: ReturnType<typeof t>;
}) {
  return (
    <div
      onClick={onOpen}
      className="rounded-2xl overflow-hidden cursor-pointer relative group flex flex-col transition-transform hover:-translate-y-1"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 24px rgba(109,94,240,0.12)`;
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
      }}
    >
      {/* Gradient cover */}
      <div
        className="h-20 w-full shrink-0 flex items-end p-3"
        style={{ background: gradient }}
      >
        <span className="text-2xl">📚</span>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2">
        <p
          className="text-sm font-semibold leading-snug line-clamp-2"
          style={{ color: "var(--color-text)" }}
        >
          {ws.title}
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {ws.sourceCount} {i.sources.toLowerCase()}
          {ws.generatedCount > 0 && (
            <span style={{ color: "var(--color-accent)" }}>
              {" · "}{ws.generatedCount} {i.roadmaps}{ws.generatedCount !== 1 ? "s" : ""}
            </span>
          )}
        </p>
        {ws.skillCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.round((ws.masteredCount / ws.skillCount) * 100)}%`,
                background: "var(--color-accent)",
              }} />
            </div>
            <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-muted)" }}>
              {ws.masteredCount}/{ws.skillCount}
            </span>
          </div>
        )}
        <p className="text-xs" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>
          {formatDate(ws.updatedAt)}
        </p>
      </div>

      {/* Three-dot menu */}
      <button
        onClick={onMenuToggle}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-opacity"
        style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}
      >
        ···
      </button>

      {menuOpen && (
        <div
          className="absolute top-11 right-3 rounded-xl shadow-xl py-1 z-10 min-w-32"
          style={{
            background: "var(--color-surface-hover)",
            border: "1px solid var(--color-border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onDelete}
            className="w-full text-left px-4 py-2 text-xs transition-colors hover:bg-red-500/10"
            style={{ color: "#f87171" }}
          >
            {i.deleteJourney}
          </button>
        </div>
      )}
    </div>
  );
}
