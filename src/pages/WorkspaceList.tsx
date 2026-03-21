import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listWorkspaces, createWorkspace, deleteWorkspace } from "../api";
import type { WorkspaceListItem } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { t, LANGUAGES } from "../i18n";
import ConfirmDialog from "../components/ConfirmDialog";

const CARD_GRADIENTS = [
  "var(--color-accent)",
  "var(--color-lavender)",
  "var(--color-teal)",
  "var(--color-electric)",
  "var(--color-sky)",
  "var(--color-hotpink)",
  "var(--color-coral)",
  "var(--color-gold)",
];

function cardHash(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return Math.abs(hash);
}

function cardGradient(id: string) {
  return CARD_GRADIENTS[cardHash(id) % CARD_GRADIENTS.length];
}

function MiniGraph({ id, skillCount }: { id: string; skillCount: number }) {
  const h = cardHash(id);
  const nodeCount = Math.min(Math.max(skillCount, 3), 8);
  const nodes: { x: number; y: number; r: number; color: string }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const seed = (h * (i + 1) * 2654435761) & 0xffffffff;
    nodes.push({
      x: 20 + ((seed % 160)),
      y: 12 + (((seed >> 8) % 56)),
      r: 3 + ((seed >> 16) % 4),
      color: CARD_GRADIENTS[(seed >> 4) % CARD_GRADIENTS.length],
    });
  }
  const edges: [number, number][] = [];
  for (let i = 1; i < nodes.length; i++) {
    const parent = ((h * i * 7) >> 3) % i;
    edges.push([parent, i]);
  }
  return (
    <svg width="200" height="80" viewBox="0 0 200 80" style={{ display: "block", width: "100%", height: "100%" }}>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={0.7} />
      ))}
    </svg>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-CA");
}

export default function WorkspaceList() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const i = t(language);
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchWorkspaces = () => {
    setLoading(true);
    setError(false);
    listWorkspaces()
      .then(setWorkspaces)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchWorkspaces(); }, []);

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
    } catch {
      toast(i.serverUnreachable, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWorkspace(id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      toast(i.deleted, "success");
    } catch {
      toast(i.deleteFailed, "error");
    }
    setMenuId(null);
    setConfirmDeleteId(null);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <header
        className="flex items-center px-4 md:px-8 py-3 md:py-4 border-b"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", backdropFilter: "var(--backdrop)" }}
      >
        <button onClick={() => navigate("/")} className="text-base font-bold gradient-text" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", letterSpacing: "0.12em" }}>ROADBOOK</button>
        <div className="ml-auto flex items-center gap-3">
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

      <main id="main-content" className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {loading ? (
          <div className="flex justify-center pt-32">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center pt-32 gap-4">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{i.serverUnreachable}</p>
            <button onClick={fetchWorkspaces} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">
              {i.retry}
            </button>
          </div>
        ) : (
          <>
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

            {workspaces.length === 0 ? (
              <div className="text-center py-20" style={{ color: "var(--color-text-muted)" }}>
                <p className="text-lg mb-2">No workspaces yet</p>
                <p className="text-sm opacity-60">Create your first journey to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                    onDelete={(e) => {
                      e.stopPropagation();
                      setMenuId(null);
                      setConfirmDeleteId(ws.id);
                    }}
                    i={i}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={i.confirmDeleteTitle}
        message={i.confirmDeleteWorkspace}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
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
        (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px rgba(0,0,0,0.1)`;
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-text-dim)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
      }}
    >
      <div
        className="h-20 w-full shrink-0 overflow-hidden"
        style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${gradient} 20%, var(--color-bg)), var(--color-bg))` }}
      >
        {ws.skillCount > 0 ? (
          <MiniGraph id={ws.id} skillCount={ws.skillCount} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.15 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
        )}
      </div>

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
              {" "}{ws.generatedCount} {i.roadmaps}{ws.generatedCount !== 1 ? "s" : ""}
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

      <button
        onClick={onMenuToggle}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-opacity"
        style={{ background: "rgba(0,0,0,0.4)", color: "var(--color-surface)" }}
      >
        {"..."}
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
            style={{ color: "var(--color-error)" }}
          >
            {i.deleteJourney}
          </button>
        </div>
      )}
    </div>
  );
}
