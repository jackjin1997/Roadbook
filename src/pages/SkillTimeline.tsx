import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getSkillEvents } from "../api";
import type { SkillEventResponse } from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { t } from "../i18n";

const STATUS_COLORS: Record<string, string> = {
  mastered: "var(--color-success)",
  learning: "var(--color-warning)",
  not_started: "var(--color-text-dim)",
};

function statusLabel(status: string | null): string {
  if (!status) return "new";
  return status.replace("_", " ");
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export default function SkillTimeline() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const i = t(language);
  const [events, setEvents] = useState<SkillEventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("");

  const fetchEvents = useCallback(() => {
    setLoading(true);
    setError(false);
    getSkillEvents({ limit: 200 })
      .then(({ events }) => setEvents(events))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return events;
    const q = filter.toLowerCase();
    return events.filter((e) => e.skillName.toLowerCase().includes(q));
  }, [events, filter]);

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
          {i.timelineTitle}
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

      {/* Filter */}
      <div className="px-4 md:px-8 py-3 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={i.timelineFilterPlaceholder}
          className="w-full max-w-sm px-3 py-1.5 rounded-lg text-sm focus:outline-none"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{i.serverUnreachable}</p>
            <button onClick={fetchEvents} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">
              {i.retry}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {filter.trim() ? i.timelineNoResults : i.timelineEmpty}
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="relative">
              {/* Vertical line */}
              <div
                className="absolute left-4 top-0 bottom-0 w-px"
                style={{ background: "var(--color-border)" }}
              />

              {filtered.map((event) => (
                <div key={event.id} className="relative flex items-start gap-4 pb-6 pl-10">
                  {/* Dot */}
                  <div
                    className="absolute left-[11px] top-1.5 w-[10px] h-[10px] rounded-full border-2"
                    style={{
                      borderColor: STATUS_COLORS[event.toStatus] ?? "var(--color-text-dim)",
                      background: STATUS_COLORS[event.toStatus] ?? "var(--color-text-dim)",
                    }}
                  />

                  {/* Event content */}
                  <div
                    className="flex-1 px-4 py-3 rounded-lg"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {event.skillName}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                        background: "var(--color-surface-dim)",
                        color: "var(--color-text-muted)",
                      }}>
                        {event.source}
                      </span>
                    </div>
                    <div className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
                      <span style={{ color: STATUS_COLORS[event.fromStatus ?? "not_started"] ?? "var(--color-text-dim)" }}>
                        {statusLabel(event.fromStatus)}
                      </span>
                      <span className="mx-1">{"\u2192"}</span>
                      <span style={{ color: STATUS_COLORS[event.toStatus] ?? "var(--color-text-dim)" }}>
                        {statusLabel(event.toStatus)}
                      </span>
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--color-text-muted)", opacity: 0.7 }}>
                      {formatTime(event.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
