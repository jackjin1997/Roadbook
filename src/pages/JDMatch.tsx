import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { postSkillMatch } from "../api";
import type { SkillMatchResult, MatchedSkill } from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { t } from "../i18n";

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    high: { bg: "rgba(255,107,107,0.08)", text: "var(--color-error)" },
    medium: { bg: "rgba(253,203,110,0.12)", text: "var(--color-warning)" },
    low: { bg: "rgba(0,184,148,0.08)", text: "var(--color-success)" },
  };
  const c = colors[priority] ?? colors.low;
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {priority}
    </span>
  );
}

function SkillList({ skills, icon }: { skills: MatchedSkill[]; icon: string }) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((s) => (
        <div
          key={s.skill}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <span>{icon}</span>
          <span style={{ color: "var(--color-text)" }}>{s.skill}</span>
          <PriorityBadge priority={s.priority} />
        </div>
      ))}
    </div>
  );
}

export default function JDMatch() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const i = t(language);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SkillMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMatch = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await postSkillMatch(text.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="flex items-center px-4 md:px-8 py-3 md:py-4 border-b shrink-0"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", backdropFilter: "var(--backdrop)" }}
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
          {i.jdMatchTitle}
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
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Input area */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
              {i.jdMatchInputLabel}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={i.jdMatchPlaceholder}
              className="w-full h-40 px-4 py-3 rounded-lg text-sm resize-none focus:outline-none"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
              disabled={loading}
            />
          </div>

          <button
            onClick={handleMatch}
            disabled={loading || !text.trim()}
            className="btn-gradient px-6 py-2.5 rounded-lg text-sm font-medium w-full mb-8"
            style={{ opacity: loading || !text.trim() ? 0.5 : 1 }}
          >
            {loading ? i.jdMatchAnalyzing : i.jdMatchButton}
          </button>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
              />
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {i.jdMatchAnalyzing}
              </p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              className="px-4 py-3 rounded-lg text-sm mb-6"
              style={{ background: "rgba(255,107,107,0.08)", color: "var(--color-error)", border: "1px solid rgba(255,107,107,0.2)" }}
            >
              {error}
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-6">
              {/* Score */}
              <div className="text-center py-6">
                <div
                  className="text-6xl font-bold mb-2"
                  style={{
                    color: result.score >= 70
                      ? "var(--color-success)"
                      : result.score >= 40
                        ? "var(--color-warning)"
                        : "var(--color-lavender)",
                  }}
                >
                  {result.score}%
                </div>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {i.jdMatchScoreLabel}
                </p>
              </div>

              {/* Matched */}
              {result.matched.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3" style={{ color: "var(--color-success)" }}>
                    {i.jdMatchMastered} ({result.matched.length})
                  </h3>
                  <SkillList skills={result.matched} icon={"\u2705"} />
                </div>
              )}

              {/* Learning */}
              {result.learning.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3" style={{ color: "var(--color-warning)" }}>
                    {i.jdMatchLearning} ({result.learning.length})
                  </h3>
                  <SkillList skills={result.learning} icon={"\u26A0\uFE0F"} />
                </div>
              )}

              {/* Missing */}
              {result.missing.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3" style={{ color: "var(--color-lavender)" }}>
                    {i.jdMatchMissing} ({result.missing.length})
                  </h3>
                  <SkillList skills={result.missing} icon={"\u274C"} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
