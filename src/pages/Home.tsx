import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getSkillIndex, createWorkspace } from "../api";
import type { SkillIndexEntry } from "../api";
import type { SkillNode } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { t, LANGUAGES } from "../i18n";
import { SkillGraph } from "../components/SkillGraph";

// ── Decay opacity ─────────────────────────────────────────────────────────────

function decayOpacity(lastActiveAt: number | null, now: number = Date.now()): number {
  if (!lastActiveAt) return 0.3;
  const DECAY_DAYS = 90;
  const daysSince = (now - lastActiveAt) / (1000 * 60 * 60 * 24);
  return Math.max(0.3, 1.0 - (daysSince / DECAY_DAYS) * 0.7);
}

// ── Convert SkillIndexEntry[] → SkillNode[] for SkillGraph ────────────────────

function toSkillTree(skills: SkillIndexEntry[]): SkillNode[] {
  return skills.map((s) => ({
    name: s.name,
    category: s.category,
    subSkills: [],
    relatedConcepts: [],
    priority: s.priority as "high" | "medium" | "low",
    description: "",
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const i = t(language);
  const toast = useToast();
  const [skills, setSkills] = useState<SkillIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchSkills = useCallback(() => {
    setLoading(true);
    setError(false);
    getSkillIndex()
      .then(({ skills }) => setSkills(skills))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

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

  const skillTree = useMemo(() => toSkillTree(skills), [skills]);

  // Build a skillProgress map and decay opacity lookup from the skill index
  const skillProgress = useMemo(() => {
    const map: Record<string, import("../types").SkillStatus> = {};
    for (const s of skills) {
      if (s.status !== "not_started") map[s.name] = s.status;
    }
    return map;
  }, [skills]);

  const now = useMemo(() => Date.now(), []);
  const decayLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of skills) {
      map.set(s.name, decayOpacity(s.lastActiveAt, now));
    }
    return map;
  }, [skills, now]);

  const nodeOpacity = useCallback(
    (name: string) => decayLookup.get(name) ?? 0.3,
    [decayLookup],
  );

  // Summary stats
  const totalSkills = skills.length;
  const mastered = skills.filter((s) => s.status === "mastered").length;
  const learning = skills.filter((s) => s.status === "learning").length;

  const hasSkills = totalSkills > 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="flex items-center px-4 md:px-8 py-3 md:py-4 border-b shrink-0"
        style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.95)", backdropFilter: "blur(8px)" }}
      >
        <span className="text-base font-bold gradient-text" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", letterSpacing: "0.12em" }}>ROADBOOK</span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/workspaces")}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)", background: "var(--color-surface)" }}
          >
            Workspaces
          </button>
          <button
            onClick={handleNew}
            disabled={creating}
            className="btn-gradient px-3 py-1.5 rounded-lg text-xs font-medium"
          >
            {creating ? i.creating : i.newJourney}
          </button>
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
      ) : !hasSkills ? (
        /* Empty state: hero section */
        <div className="flex-1 flex items-center justify-center">
          <HeroSection i={i} creating={creating} onNew={handleNew} />
        </div>
      ) : (
        /* Skill graph */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 md:gap-6 px-4 md:px-8 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{totalSkills}</span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>skills</span>
            </div>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)", maxWidth: 200 }}>
              <div className="h-full flex">
                {mastered > 0 && <div style={{ width: `${(mastered / totalSkills) * 100}%`, background: "#00B894" }} />}
                {learning > 0 && <div style={{ width: `${(learning / totalSkills) * 100}%`, background: "#FDCB6E" }} />}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#00B894" }} />{mastered} mastered</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "#FDCB6E" }} />{learning} learning</span>
              <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "var(--color-border)" }} />{totalSkills - mastered - learning} pending</span>
            </div>
          </div>

          {/* Full-page graph */}
          <div className="flex-1 min-h-0" style={{ overflow: "hidden" }}>
            <SkillGraph
              skillTree={skillTree}
              skillProgress={skillProgress}
              nodeOpacity={nodeOpacity}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hero Section (shown when no skills) ──────────────────────────────────────

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
    <div className="text-center relative" style={{ padding: "clamp(40px, 8vw, 80px) 0 clamp(32px, 6vw, 64px)" }}>
      <div className="anim-fade-up" style={{ marginBottom: 32 }}>
        <span style={{
          fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
          color: "#888", fontWeight: 600,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        }}>
          Roadbook &nbsp;/&nbsp; Living Skill Graph
        </span>
      </div>

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
          <span key={idx} style={{ color: "inherit" }}>{char}</span>
        ))}
        {!done && <span className="cursor-blink" />}
      </h1>

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
