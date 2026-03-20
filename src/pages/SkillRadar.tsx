import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSkillIndex } from "../api";
import type { SkillIndexEntry } from "../api";



const CATEGORY_COLORS = [
  "var(--color-cherry)", "var(--color-teal)", "var(--color-lavender)", "var(--color-hotpink)", "var(--color-electric)",
  "var(--color-sky)", "var(--color-lime)", "var(--color-coral)", "var(--color-peach)", "var(--color-gold)",
];

function categoryColor(categories: string[], cat: string): string {
  const idx = categories.indexOf(cat);
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  mastered: { bg: "color-mix(in srgb, var(--color-success) 15%, transparent)", label: "Mastered" },
  learning: { bg: "color-mix(in srgb, var(--color-warning) 15%, transparent)", label: "Learning" },
  not_started: { bg: "transparent", label: "Not Started" },
};

type FilterStatus = "all" | "mastered" | "learning" | "not_started";

export default function SkillRadar() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getSkillIndex()
      .then(({ skills }) => setSkills(skills))
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(skills.map((s) => s.category))];

  const filtered = skills.filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = new Map<string, SkillIndexEntry[]>();
  for (const s of filtered) {
    const list = grouped.get(s.category) ?? [];
    list.push(s);
    grouped.set(s.category, list);
  }

  const totalSkills = skills.length;
  const mastered = skills.filter((s) => s.status === "mastered").length;
  const learning = skills.filter((s) => s.status === "learning").length;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <header className="flex items-center px-4 md:px-8 py-3 md:py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={() => navigate("/")} className="text-xl font-bold gradient-text">Roadbook</button>
        <span className="mx-2" style={{ color: "var(--color-border)" }}>/</span>
        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Skill Radar</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {loading ? (
          <div className="flex justify-center pt-32">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-32" style={{ color: "var(--color-text-muted)" }}>
            <p className="text-lg mb-2">No skills yet</p>
            <p className="text-sm opacity-60">Generate roadmaps in your workspaces to see skills here.</p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-6 md:mb-8">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold" style={{ color: "var(--color-text)" }}>{totalSkills}</span>
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>skills</span>
              </div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                <div className="h-full flex">
                  {mastered > 0 && (
                    <div style={{ width: `${(mastered / totalSkills) * 100}%`, background: "var(--color-success)" }} />
                  )}
                  {learning > 0 && (
                    <div style={{ width: `${(learning / totalSkills) * 100}%`, background: "var(--color-warning)" }} />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "var(--color-success)" }} />{mastered} mastered</span>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "var(--color-warning)" }} />{learning} learning</span>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: "var(--color-border)" }} />{totalSkills - mastered - learning} pending</span>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-6">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills…"
                className="text-sm rounded-lg px-3 py-1.5 focus:outline-none flex-1"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", maxWidth: 280 }}
              />
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                {(["all", "mastered", "learning", "not_started"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className="text-xs px-2.5 py-1.5 capitalize transition-colors"
                    style={{
                      background: filter === f ? "var(--color-accent)" : "var(--color-surface)",
                      color: filter === f ? "var(--color-surface)" : "var(--color-text-muted)",
                    }}>
                    {f === "all" ? "All" : f === "not_started" ? "Pending" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Category groups */}
            {[...grouped.entries()].map(([category, items]) => (
              <div key={category} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full" style={{ background: categoryColor(categories, category) }} />
                  <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{category}</span>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>({items.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {items.map((skill) => (
                    <div key={skill.name}
                      className="rounded-xl px-3 py-2.5 transition-colors"
                      style={{
                        background: STATUS_STYLE[skill.status]?.bg || "transparent",
                        border: `1px solid ${skill.status === "mastered" ? "color-mix(in srgb, var(--color-success) 30%, transparent)" : skill.status === "learning" ? "color-mix(in srgb, var(--color-warning) 30%, transparent)" : "var(--color-border)"}`,
                      }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{skill.name}</span>
                        {skill.priority === "high" && (
                          <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--color-error) 8%, transparent)", color: "var(--color-error)" }}>high</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {skill.workspaces.map((ws) => (
                          <button key={ws.id} onClick={() => navigate(`/workspace/${ws.id}`)}
                            className="text-[10px] px-1.5 py-0.5 rounded-md hover:opacity-80 transition-opacity"
                            style={{ background: "var(--color-surface-hover)", color: "var(--color-accent)" }}>
                            {ws.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
