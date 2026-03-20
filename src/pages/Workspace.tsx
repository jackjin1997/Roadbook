import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "../components/MermaidDiagram";
import { SkillGraph } from "../components/SkillGraph";
import {
  getWorkspace,
  renameWorkspace,
  addSource,
  addUrlSource,
  addFileSource,
  deleteSource,
  generateRoadmap,
  generateJourney,
  digestSource,
  listModels,
  streamChatMessage,
  addInsight,
  deleteInsight,
  addResearchTodo,
  deleteResearchTodo,
  runResearchTodo,
  updateSkillProgress,
} from "../api";
import type { ChatMessage, GenerationProgress } from "../api";
import type { Workspace, Source, Insight, ResearchTodo } from "../types";
import { resolveSkillStatus } from "../types";
import JSZip from "jszip";
import ResizeHandle from "../components/ResizeHandle";
import ConfirmDialog from "../components/ConfirmDialog";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useTheme } from "../contexts/ThemeContext";
import { t, LANGUAGES } from "../i18n";

// Markdown renderer with mermaid diagram support
const mdComponents = {
  code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
    const lang = className?.replace("language-", "");
    if (lang === "mermaid") {
      return <MermaidDiagram code={String(children).trim()} />;
    }
    return <code className={className} {...props}>{children}</code>;
  },
};

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function downloadMarkdown(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_") + ".md";
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadObsidianVault(title: string, markdown: string, skillTree?: import("../types").SkillNode[]) {
  const zip = new JSZip();
  const safeName = (s: string) => s.replace(/[/\\:*?"<>|]/g, "_");

  // Main index file
  zip.file(`${safeName(title)}.md`, markdown);

  // One file per skill node with wikilinks
  if (skillTree?.length) {
    for (const node of skillTree) {
      const lines: string[] = [];
      lines.push(`# ${node.name}`);
      lines.push("");
      lines.push(`**Category:** ${node.category}  `);
      lines.push(`**Priority:** ${node.priority}`);
      lines.push("");
      if (node.description) {
        lines.push(node.description);
        lines.push("");
      }
      if (node.subSkills.length) {
        lines.push("## Sub-skills");
        for (const s of node.subSkills) lines.push(`- ${s}`);
        lines.push("");
      }
      if (node.relatedConcepts.length) {
        lines.push("## Related");
        const nodeNames = new Set(skillTree.map((n) => n.name));
        for (const r of node.relatedConcepts) {
          lines.push(`- ${nodeNames.has(r) ? `[[${r}]]` : r}`);
        }
        lines.push("");
      }
      lines.push(`---`);
      lines.push(`Back to [[${safeName(title)}]]`);
      zip.file(`${safeName(node.name)}.md`, lines.join("\n"));
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(title) + "_vault.zip";
  a.click();
  URL.revokeObjectURL(url);
}

// Parse markdown into sections by ## and ### headings for digest selection
function parseMarkdownSections(md: string): { id: string; heading: string; content: string; level: number }[] {
  const lines = md.split("\n");
  const sections: { id: string; heading: string; content: string; level: number }[] = [];
  let current: { heading: string; lines: string[]; level: number } | null = null;

  for (const line of lines) {
    const h2 = line.startsWith("## ") && !line.startsWith("### ");
    const h3 = line.startsWith("### ");
    if (h2 || h3) {
      if (current) sections.push({ id: current.heading, heading: current.heading, content: current.lines.join("\n").trim(), level: current.level });
      const level = h3 ? 3 : 2;
      const heading = line.replace(/^#{2,3}\s+/, "").trim();
      current = { heading, lines: [line], level };
    } else {
      current?.lines.push(line);
    }
  }
  if (current) sections.push({ id: current.heading, heading: current.heading, content: current.lines.join("\n").trim(), level: current.level });
  return sections;
}

type MainTab = "source" | "journey";
type RightTab = "chat" | "insights" | "research";

const mqSubscribe = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const mqSnapshot = () => window.matchMedia("(max-width: 768px)").matches;
function useIsMobile() { return useSyncExternalStore(mqSubscribe, mqSnapshot); }

type MobilePanel = "sources" | "main" | "chat";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Tabs
  const [mainTab, setMainTab] = useState<MainTab>("source");
  const [rightTab, setRightTab] = useState<RightTab>("chat");

  // Journey generation
  const [checkedSourceIds, setCheckedSourceIds] = useState<Set<string>>(new Set());
  const [generatingJourney, setGeneratingJourney] = useState(false);
  const [journeyView, setJourneyView] = useState<"prose" | "graph">("graph");
  const [sourceView, setSourceView] = useState<"prose" | "graph">("graph");

  // Generation progress
  const [genProgress, setGenProgress] = useState<GenerationProgress | null>(null);
  const [failedSkillsNotice, setFailedSkillsNotice] = useState<string[] | null>(null);

  // Digest
  const [digestMode, setDigestMode] = useState(false);
  const [checkedSegmentIds, setCheckedSegmentIds] = useState<Set<string>>(new Set());
  const [digesting, setDigesting] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Insights
  const [insightDraft, setInsightDraft] = useState("");

  // Research todos
  const [todoDraft, setTodoDraft] = useState("");
  const [runningTodoId, setRunningTodoId] = useState<string | null>(null);

  // Panels
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("main");
  const [sourceWidth, setSourceWidth] = useState(220);
  const [chatWidth, setChatWidth] = useState(340);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const resizeSources = useCallback((delta: number) => setSourceWidth((w) => Math.max(160, Math.min(400, w + delta))), []);
  const resizeChat = useCallback((delta: number) => setChatWidth((w) => Math.max(260, Math.min(600, w - delta))), []);
  const { language, setLanguage } = useLanguage();
  const toast = useToast();
  const { theme } = useTheme();
  const i = t(language);

  // Confirm delete state
  const [confirmDeleteSourceId, setConfirmDeleteSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getWorkspace(id).then((ws) => {
      setWorkspace(ws);
      setTitleDraft(ws.title);
      if (ws.sources.length > 0) setSelectedSourceId(ws.sources[0].id);
    });
    listModels().then(({ models }) => {
      setModels(models);
      if (models.length > 0) setSelectedModel(models.find(m => m === "gemini-3-flash-preview") ?? models[0]);
    });
  }, [id]);

  useEffect(() => { if (editingTitle) titleInputRef.current?.focus(); }, [editingTitle]);
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const selectedSource = workspace?.sources.find((s) => s.id === selectedSourceId) ?? null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRename = async () => {
    if (!workspace || !titleDraft.trim()) { setEditingTitle(false); return; }
    try {
      const updated = await renameWorkspace(workspace.id, titleDraft.trim());
      setWorkspace((w) => w ? { ...w, title: updated.title } : w);
    } catch {
      toast(i.renameFailed, "error");
      setTitleDraft(workspace.title);
    }
    setEditingTitle(false);
  };

  const isUrl = (s: string) => /^https?:\/\/.+/.test(s.trim());

  const handleAddSource = async () => {
    if (!workspace || !sourceDraft.trim()) return;
    setAddingSource(true);
    try {
      const fn = isUrl(sourceDraft) ? addUrlSource : addSource;
      const source = await fn(workspace.id, sourceDraft.trim(), language);
      setWorkspace((w) => w ? { ...w, sources: [...w.sources, source] } : w);
      setSelectedSourceId(source.id);
      setSourceDraft("");
      setShowAddSource(false);
      toast(i.sourceAdded, "success");
    } catch {
      toast(i.sourceAddFailed, "error");
    } finally { setAddingSource(false); }
  };

  const handleAddFile = async (file: File) => {
    if (!workspace) return;
    setAddingSource(true);
    try {
      const source = await addFileSource(workspace.id, file, language);
      setWorkspace((w) => w ? { ...w, sources: [...w.sources, source] } : w);
      setSelectedSourceId(source.id);
      setShowAddSource(false);
      toast(i.sourceAdded, "success");
    } catch {
      toast(i.sourceAddFailed, "error");
    } finally { setAddingSource(false); }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!workspace) return;
    try {
      await deleteSource(workspace.id, sourceId);
      const remaining = workspace.sources.filter((s) => s.id !== sourceId);
      setWorkspace((w) => w ? { ...w, sources: remaining } : w);
      if (selectedSourceId === sourceId) setSelectedSourceId(remaining[0]?.id ?? null);
      setCheckedSourceIds((s) => { const n = new Set(s); n.delete(sourceId); return n; });
      toast(i.deleted, "success");
    } catch {
      toast(i.deleteFailed, "error");
    }
    setConfirmDeleteSourceId(null);
  };

  const handleGenerate = async (sourceId: string) => {
    if (!workspace) return;
    setGeneratingId(sourceId);
    setGenProgress(null);
    setFailedSkillsNotice(null);
    try {
      const { roadmap, workspaceTitle, failedSkills } = await generateRoadmap(workspace.id, sourceId, selectedModel || undefined, setGenProgress);
      setWorkspace((w) => w ? { ...w, title: workspaceTitle, sources: w.sources.map((s) => s.id === sourceId ? { ...s, roadmap } : s) } : w);
      setTitleDraft(workspaceTitle);
      if (failedSkills && failedSkills.length > 0) setFailedSkillsNotice(failedSkills);
      toast(i.generationComplete, "success");
    } catch {
      toast(i.generationFailed, "error");
    } finally { setGeneratingId(null); setGenProgress(null); }
  };

  const handleGenerateJourney = async () => {
    if (!workspace) return;
    setGeneratingJourney(true);
    setGenProgress(null);
    setFailedSkillsNotice(null);
    try {
      const ids = checkedSourceIds.size > 0 ? [...checkedSourceIds] : workspace.sources.map((s) => s.id);
      const { roadmap, workspaceTitle, failedSkills } = await generateJourney(workspace.id, ids, selectedModel || undefined, setGenProgress);
      setWorkspace((w) => w ? { ...w, roadmap, title: workspaceTitle } : w);
      setTitleDraft(workspaceTitle);
      setMainTab("journey");
      if (failedSkills && failedSkills.length > 0) setFailedSkillsNotice(failedSkills);
      toast(i.generationComplete, "success");
    } catch {
      toast(i.generationFailed, "error");
    } finally { setGeneratingJourney(false); setGenProgress(null); }
  };

  const handleDigest = async () => {
    if (!workspace || !selectedSource || checkedSegmentIds.size === 0) return;
    const sections = parseMarkdownSections(selectedSource.roadmap?.markdown ?? "");
    const selected = sections.filter((s) => checkedSegmentIds.has(s.id));
    setDigesting(true);
    try {
      const { roadmap } = await digestSource(workspace.id, selectedSource.id, selected.map((s) => s.id), selected.map((s) => s.content));
      setWorkspace((w) => w ? {
        ...w,
        roadmap,
        sources: w.sources.map((s) => s.id === selectedSource.id
          ? { ...s, digestedSegmentIds: [...new Set([...s.digestedSegmentIds, ...checkedSegmentIds])] }
          : s),
      } : w);
      setCheckedSegmentIds(new Set());
      setDigestMode(false);
      setMainTab("journey");
      toast(i.digestComplete, "success");
    } catch {
      toast(i.generationFailed, "error");
    } finally { setDigesting(false); }
  };

  const handleChat = async () => {
    if (!workspace || !chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const next = [...chatMessages, userMsg];
    setChatMessages([...next, { role: "assistant", content: "" }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const activeIds = checkedSourceIds.size > 0
        ? [...checkedSourceIds]
        : selectedSourceId ? [selectedSourceId] : [];
      const result = await streamChatMessage(workspace.id, next, activeIds.length ? activeIds : undefined, (chunk) => {
        setChatMessages((msgs) => {
          const last = msgs[msgs.length - 1];
          if (last?.role !== "assistant") return msgs;
          return [...msgs.slice(0, -1), { role: "assistant", content: last.content + chunk }];
        });
      }, language);
      setChatMessages((msgs) => [...msgs.slice(0, -1), { role: "assistant", content: result.reply }]);
      if (result.roadbookUpdated && result.roadmap && selectedSourceId) {
        setWorkspace((w) => w ? { ...w, sources: w.sources.map((s) => s.id === selectedSourceId ? { ...s, roadmap: result.roadmap } : s) } : w);
      }
    } catch {
      toast(i.chatSendFailed, "error");
      // Remove the empty assistant placeholder
      setChatMessages((msgs) => msgs.filter((m) => m.content !== "" || m.role !== "assistant"));
    } finally { setChatLoading(false); }
  };

  const handleAddInsight = async () => {
    if (!workspace || !insightDraft.trim()) return;
    const insight = await addInsight(workspace.id, insightDraft.trim());
    setWorkspace((w) => w ? { ...w, insights: [...w.insights, insight] } : w);
    setInsightDraft("");
  };

  const handleDeleteInsight = async (insightId: string) => {
    if (!workspace) return;
    await deleteInsight(workspace.id, insightId);
    setWorkspace((w) => w ? { ...w, insights: w.insights.filter((i) => i.id !== insightId) } : w);
  };

  const handleAddTodo = async () => {
    if (!workspace || !todoDraft.trim()) return;
    const todo = await addResearchTodo(workspace.id, todoDraft.trim());
    setWorkspace((w) => w ? { ...w, researchTodos: [...w.researchTodos, todo] } : w);
    setTodoDraft("");
  };

  const handleDeleteTodo = async (todoId: string) => {
    if (!workspace) return;
    await deleteResearchTodo(workspace.id, todoId);
    setWorkspace((w) => w ? { ...w, researchTodos: w.researchTodos.filter((t) => t.id !== todoId) } : w);
  };

  const handleRunTodo = async (todoId: string) => {
    if (!workspace) return;
    setRunningTodoId(todoId);
    try {
      const { todo, source } = await runResearchTodo(workspace.id, todoId);
      setWorkspace((w) => w ? {
        ...w,
        sources: [...w.sources, source],
        researchTodos: w.researchTodos.map((t) => t.id === todoId ? todo : t),
      } : w);
      // Auto-navigate to the new source
      setSelectedSourceId(source.id);
      setMainTab("source");
      if (isMobile) setMobilePanel("sources");
      toast(i.researchComplete, "success");
    } catch {
      toast(i.generationFailed, "error");
    } finally { setRunningTodoId(null); }
  };

  // ── Digest status helper ─────────────────────────────────────────────────────
  const digestStatus = (source: Source) => {
    if (!source.roadmap) return null;
    const total = parseMarkdownSections(source.roadmap.markdown).length;
    if (total === 0) return null;
    const done = source.digestedSegmentIds.length;
    if (done === 0) return "●";
    if (done >= total) return "○";
    return "◑";
  };

  if (!workspace) {
    return <div className="flex items-center justify-center h-screen" style={{ color: "var(--color-text-muted)" }}>Loading...</div>;
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header className="flex items-center gap-2 px-3 md:px-5 py-2.5 md:py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", backdropFilter: "var(--backdrop)" }}>
        <button onClick={() => navigate("/")} className="text-xs font-bold shrink-0 gradient-text" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase" as const }}>ROADBOOK</button>
        <span style={{ color: "var(--color-border)" }}>/</span>
        {editingTitle ? (
          <input ref={titleInputRef} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRename} onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingTitle(false); }}
            className="text-sm font-medium bg-transparent border-b focus:outline-none px-1 min-w-0 flex-1"
            style={{ color: "var(--color-text)", borderColor: "var(--color-accent)" }} />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="text-sm font-medium hover:opacity-70 transition-opacity truncate min-w-0" style={{ color: "var(--color-text)" }} title="Click to rename">
            {workspace.title}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {models.length > 0 && (
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)", maxWidth: isMobile ? 100 : 180 }}>
              {models.map((m) => <option key={m} value={m}>{m.replace(/^.*\//, "")}</option>)}
            </select>
          )}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}
            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </header>

      {/* Mobile panel switcher */}
      <div className="mobile-panel-bar items-center border-b shrink-0" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        {(["sources", "main", "chat"] as MobilePanel[]).map((p) => (
          <button key={p} onClick={() => setMobilePanel(p)}
            className="flex-1 text-xs py-2.5 font-medium transition-colors capitalize"
            style={{
              color: mobilePanel === p ? "var(--color-text)" : "var(--color-text-muted)",
              borderBottom: mobilePanel === p ? "2px solid var(--color-accent)" : "2px solid transparent",
            }}>
            {p === "sources" ? `Sources (${workspace.sources.length})` : p === "main" ? "Roadbook" : "Chat"}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Sources panel */}
        <div className="flex flex-col shrink-0" style={{
          width: isMobile ? "100%" : sourceWidth,
          display: isMobile && mobilePanel !== "sources" ? "none" : undefined,
          background: "var(--color-surface-dim)",
        }}>
          <div className="px-3 py-2.5 text-xs font-medium border-b flex items-center justify-between"
            style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}>
            {i.sources}
            <button onClick={() => setShowAddSource(true)} className="btn-gradient text-xs px-2.5 py-1 rounded-lg font-medium">{i.addSource}</button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {workspace.sources.length === 0 && !showAddSource && (
              <p className="px-3 py-6 text-xs text-center" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>{i.noSourcesYet}</p>
            )}
            {workspace.sources.map((source) => (
              <SourceItem key={source.id} source={source}
                selected={selectedSourceId === source.id}
                checked={checkedSourceIds.has(source.id)}
                generating={generatingId === source.id}
                digestStatus={digestStatus(source)}
                onSelect={() => { setSelectedSourceId(source.id); setMainTab("source"); setDigestMode(false); setCheckedSegmentIds(new Set()); }}
                onCheck={(v) => setCheckedSourceIds((s) => { const n = new Set(s); v ? n.add(source.id) : n.delete(source.id); return n; })}
                onDelete={() => setConfirmDeleteSourceId(source.id)}
                onGenerate={() => handleGenerate(source.id)}
                i={i}
              />
            ))}
          </div>

          {/* Journey generate button */}
          {workspace.sources.length > 0 && (
            <div className="p-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <button
                onClick={handleGenerateJourney}
                disabled={generatingJourney}
                className="btn-gradient w-full text-xs py-1.5 rounded-lg font-medium disabled:opacity-40"
              >
                {generatingJourney ? "Weaving…" : checkedSourceIds.size > 0 ? `Journey (${checkedSourceIds.size})` : "Generate Journey"}
              </button>
            </div>
          )}

          {/* Add source form */}
          {showAddSource && (
            <div className="p-3 border-t" style={{ borderColor: "var(--color-border)" }}>
              <div className="relative">
                <textarea autoFocus className="w-full text-xs rounded p-2 resize-none focus:outline-none"
                  style={{ background: "var(--color-bg)", border: `1px solid ${isUrl(sourceDraft) ? "var(--color-accent)" : "var(--color-border)"}`, color: "var(--color-text)", height: 90 }}
                  placeholder={i.pasteHint} value={sourceDraft} onChange={(e) => setSourceDraft(e.target.value)} />
                {isUrl(sourceDraft) && (
                  <span className="absolute top-1.5 right-2 text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}>URL</span>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={handleAddSource} disabled={!sourceDraft.trim() || addingSource} className="btn-gradient flex-1 text-xs py-1.5 rounded-lg font-medium">
                  {addingSource ? i.adding : i.addSource.replace("+ ", "")}
                </button>
                <label className="text-xs py-1.5 px-2.5 rounded cursor-pointer transition-colors flex items-center"
                  style={{ background: "var(--color-surface-hover)", color: "var(--color-text-muted)" }} title="Upload file (PDF, DOCX, TXT, image)">
                  ↑
                  <input type="file" accept=".pdf,.docx,.txt,.md,image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddFile(f); e.target.value = ""; }} />
                </label>
                <button onClick={() => { setShowAddSource(false); setSourceDraft(""); }}
                  className="text-xs py-1.5 px-3 rounded transition-colors" style={{ background: "var(--color-surface-hover)", color: "var(--color-text-muted)" }}>
                  {i.cancel}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="desktop-resize-handle"><ResizeHandle onResize={resizeSources} /></div>

        {/* Main panel */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{
          background: "var(--color-surface)",
          display: isMobile && mobilePanel !== "main" ? "none" : undefined,
        }}>
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
            {(["source", "journey"] as MainTab[]).map((tab) => (
              <button key={tab} onClick={() => setMainTab(tab)}
                className="text-xs px-3 py-1.5 rounded-t-lg font-medium transition-colors capitalize"
                style={{
                  background: mainTab === tab ? "var(--color-bg)" : "transparent",
                  color: mainTab === tab ? "var(--color-text)" : "var(--color-text-muted)",
                  borderBottom: mainTab === tab ? "2px solid var(--color-accent)" : "2px solid transparent",
                }}>
                {tab === "journey" ? "Journey" : "Source"}
                {tab === "journey" && workspace.roadmap && (
                  <span className="ml-1 text-[9px] px-1 py-0.5 rounded" style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}>✓</span>
                )}
              </button>
            ))}
            {/* Digest toggle (only in source tab when source has roadmap) */}
            {mainTab === "source" && selectedSource?.roadmap && (
              <button onClick={() => { setDigestMode((v) => !v); setCheckedSegmentIds(new Set()); }}
                className="ml-auto text-xs px-2.5 py-1 rounded-lg transition-colors"
                style={{
                  background: digestMode ? "var(--color-accent)" : "var(--color-surface-hover)",
                  color: digestMode ? "var(--color-bg)" : "var(--color-text-muted)",
                }}>
                {digestMode ? "Cancel Digest" : "Digest →"}
              </button>
            )}
            {/* Digest confirm button */}
            {digestMode && checkedSegmentIds.size > 0 && (
              <button onClick={handleDigest} disabled={digesting}
                className="ml-2 text-xs px-2.5 py-1 rounded-lg btn-gradient disabled:opacity-40">
                {digesting ? "Digesting…" : `Digest ${checkedSegmentIds.size} section${checkedSegmentIds.size > 1 ? "s" : ""} →`}
              </button>
            )}
          </div>

          {/* Failed skills notice */}
          {failedSkillsNotice && (
            <div className="mx-4 mt-2 px-3 py-2 rounded-lg text-xs flex items-center justify-between"
              style={{ background: "color-mix(in srgb, var(--color-warning) 12%, transparent)", color: "var(--color-text-muted)", border: "1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)" }}>
              <span>{failedSkillsNotice.length} skill(s) had no research results: {failedSkillsNotice.join(", ")}</span>
              <button onClick={() => setFailedSkillsNotice(null)} className="ml-2 opacity-60 hover:opacity-100" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>×</button>
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-auto flex flex-col" style={{ minHeight: 0 }}>
            {mainTab === "source" && (
              <>
                {!selectedSource ? (
                  <EmptyState i={i} onAdd={() => setShowAddSource(true)} />
                ) : selectedSource.roadmap ? (
                  sourceView === "graph" && selectedSource.roadmap.skillTree && selectedSource.roadmap.skillTree.length > 0 && !digestMode ? (
                    /* ── Source full-panel graph view (MiroFish style) ── */
                    <div className="relative flex-1 min-h-0" style={{ overflow: "hidden", height: "100%" }}>
                      <SkillGraph
                        skillTree={selectedSource.roadmap.skillTree}
                        skillProgress={workspace.skillProgress}
                        onStatusChange={async (name, status) => {
                          if (!workspace) return;
                          const { skillProgress: updated } = await updateSkillProgress(workspace.id, name, status);
                          setWorkspace((w) => w ? { ...w, skillProgress: updated } : w);
                        }}
                        theme={theme}
                      />
                      <GraphFloatingToolbar
                        title="Graph Relationship Visualization"
                        badge={<span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--color-surface-hover)", color: "var(--color-text-dim)", border: "1px solid var(--color-border)" }}>{selectedSource.roadmap.skillTree.length} nodes</span>}
                        view={sourceView} onViewChange={setSourceView}
                        onExport={() => downloadMarkdown(selectedSource.roadmap!.markdown, selectedSource.reference || "roadbook")}
                        onRegenerate={() => handleGenerate(selectedSource.id)}
                        regenerating={generatingId === selectedSource.id}
                      />
                    </div>
                  ) : (
                    /* ── Source prose view ── */
                    <div className="px-4 md:px-10 py-6 md:py-8 max-w-3xl mx-auto">
                      <div className="flex items-center justify-between mb-8">
                        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                          {selectedSource.origin === "research" && <span>🔬</span>}
                          <span style={{ opacity: 0.6 }}>{i.generated} {formatDate(selectedSource.roadmap.generatedAt)}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          {selectedSource.roadmap.skillTree && selectedSource.roadmap.skillTree.length > 0 && (
                            <ViewToggle current={sourceView} onChange={(v) => { setSourceView(v); setDigestMode(false); }} />
                          )}
                          <button onClick={() => downloadMarkdown(selectedSource.roadmap!.markdown, selectedSource.reference || "roadbook")}
                            className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                            style={toolbarBtnStyle} title="Export as Markdown">
                            .md
                          </button>
                          <button onClick={() => handleGenerate(selectedSource.id)} disabled={generatingId === selectedSource.id}
                            className="text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                            style={toolbarBtnStyle}>
                            {generatingId === selectedSource.id ? i.regenerating : i.regenerate}
                          </button>
                        </div>
                      </div>
                      {digestMode ? (
                        <DigestableRoadmap
                          markdown={selectedSource.roadmap.markdown}
                          digestedIds={selectedSource.digestedSegmentIds}
                          checkedIds={checkedSegmentIds}
                          onToggle={(id) => setCheckedSegmentIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                        />
                      ) : (
                        <article className="prose prose-sm max-w-none">
                          <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{selectedSource.roadmap.markdown}</Markdown>
                        </article>
                      )}
                    </div>
                  )
                ) : (
                  <GeneratePrompt i={i} generating={generatingId === selectedSource.id} onGenerate={() => handleGenerate(selectedSource.id)} progress={generatingId === selectedSource.id ? genProgress : null} />
                )}
              </>
            )}

            {mainTab === "journey" && (
              workspace.roadmap ? (
                journeyView === "graph" && workspace.roadmap.skillTree ? (
                  /* ── Full-panel graph view (MiroFish style) ── */
                  <div className="relative flex-1 min-h-0" style={{ overflow: "hidden" }}>
                    {/* Graph fills entire panel */}
                    <SkillGraph
                      skillTree={workspace.roadmap.skillTree}
                      skillProgress={workspace.skillProgress}
                      onStatusChange={async (name, status) => {
                        if (!workspace) return;
                        const { skillProgress: updated } = await updateSkillProgress(workspace.id, name, status);
                        setWorkspace((w) => w ? { ...w, skillProgress: updated } : w);
                      }}
                      theme={theme}
                    />
                    <GraphFloatingToolbar
                      title="Graph Relationship Visualization"
                      badge={(() => {
                        const total = workspace.roadmap.skillTree!.length;
                        const mastered = workspace.roadmap.skillTree!.filter((s) => resolveSkillStatus(workspace.skillProgress[s.name]) === "mastered").length;
                        const learning = workspace.roadmap.skillTree!.filter((s) => resolveSkillStatus(workspace.skillProgress[s.name]) === "learning").length;
                        if (mastered === 0 && learning === 0) return undefined;
                        return <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--color-surface-hover)", color: "var(--color-text-dim)", border: "1px solid var(--color-border)" }}>{mastered}/{total} mastered{learning > 0 ? ` · ${learning} learning` : ""}</span>;
                      })()}
                      view={journeyView} onViewChange={setJourneyView}
                      onExport={() => downloadMarkdown(workspace.roadmap!.markdown, workspace.title || "journey")}
                      onRegenerate={handleGenerateJourney}
                      regenerating={generatingJourney}
                    />
                  </div>
                ) : (
                  /* ── Prose view ── */
                  <div className="px-4 md:px-10 py-6 md:py-8 max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-3">
                        <p className="text-xs" style={{ color: "var(--color-text-dim)", opacity: 0.6 }}>
                          Journey · {formatDate(workspace.roadmap.generatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {workspace.roadmap.skillTree && workspace.roadmap.skillTree.length > 0 && (
                          <ViewToggle current={journeyView} onChange={setJourneyView} />
                        )}
                        <button onClick={() => downloadMarkdown(workspace.roadmap!.markdown, workspace.title || "journey")}
                          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                          style={toolbarBtnStyle} title="Export as Markdown">
                          .md
                        </button>
                        <button onClick={() => downloadObsidianVault(workspace.title || "journey", workspace.roadmap!.markdown, workspace.roadmap!.skillTree)}
                          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                          style={toolbarBtnStyle} title="Export as Obsidian Vault (.zip)">
                          Obsidian
                        </button>
                        <button onClick={handleGenerateJourney} disabled={generatingJourney}
                          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                          style={toolbarBtnStyle}>
                          {generatingJourney ? "Weaving…" : "Regenerate"}
                        </button>
                      </div>
                    </div>
                    <article className="prose max-w-none">
                      <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{workspace.roadmap.markdown}</Markdown>
                    </article>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center h-full" style={{ color: "var(--color-text-muted)" }}>
                  <div className="text-center space-y-4">
                    {generatingJourney ? (
                      genProgress ? (
                        <ProgressIndicator progress={genProgress} stages={JOURNEY_STAGE_KEYS} i={i} />
                      ) : (
                        <>
                          <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
                          <p className="text-sm">Weaving your journey roadmap…</p>
                        </>
                      )
                    ) : (
                      <>
                        <p className="text-sm">{i.noJourneyYet}</p>
                        <p className="text-xs opacity-60 max-w-xs">{i.journeyHint}</p>
                        <button onClick={handleGenerateJourney} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">
                          Generate Journey
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <div className="desktop-resize-handle"><ResizeHandle onResize={resizeChat} /></div>

        {/* Right panel: Chat / Insights / Research */}
        <div className="flex flex-col shrink-0" style={{
          width: isMobile ? "100%" : chatWidth,
          background: "var(--color-bg)",
          display: isMobile && mobilePanel !== "chat" ? "none" : undefined,
        }}>
          {/* Tab bar */}
          <div className="flex border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
            {(["chat", "insights", "research"] as RightTab[]).map((tab) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                className="flex-1 text-xs py-2.5 font-medium transition-colors capitalize"
                style={{
                  color: rightTab === tab ? "var(--color-text)" : "var(--color-text-muted)",
                  borderBottom: rightTab === tab ? "2px solid var(--color-accent)" : "2px solid transparent",
                }}>
                {tab === "insights" ? `Insights${workspace.insights.length > 0 ? ` (${workspace.insights.length})` : ""}` :
                  tab === "research" ? `Research${workspace.researchTodos.length > 0 ? ` (${workspace.researchTodos.length})` : ""}` :
                  "Chat"}
              </button>
            ))}
          </div>

          {/* Chat tab */}
          {rightTab === "chat" && (
            <>
              {/* Context indicator */}
              <div className="px-3 py-1.5 border-b flex items-center gap-1.5 flex-wrap shrink-0"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", minHeight: 32 }}>
                <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-muted)", opacity: 0.6 }}>ctx:</span>
                {(() => {
                  const activeSources = checkedSourceIds.size > 0
                    ? workspace.sources.filter((s) => checkedSourceIds.has(s.id))
                    : selectedSourceId
                      ? workspace.sources.filter((s) => s.id === selectedSourceId)
                      : workspace.sources;
                  return (
                    <>
                      {activeSources.slice(0, 3).map((s) => (
                        <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded truncate max-w-[120px]"
                          style={{ background: "var(--color-border)", color: "var(--color-text-muted)" }}
                          title={s.reference}>
                          {s.origin === "research" ? "🔬 " : ""}{(s.type === "url" ? s.reference.replace(/^https?:\/\//, "") : s.reference).slice(0, 30)}
                        </span>
                      ))}
                      {activeSources.length > 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--color-border)", color: "var(--color-text-muted)" }}>
                          +{activeSources.length - 3}
                        </span>
                      )}
                      {workspace.roadmap && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)" }}>
                          Journey
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-center mt-8" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>
                    Ask Ariadne anything about this journey, or request roadbook changes.
                  </p>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className="text-xs max-w-[88%] leading-relaxed"
                      style={msg.role === "user"
                        ? { background: "var(--color-accent)", color: "var(--color-bg)", borderRadius: "14px 14px 3px 14px", padding: "8px 14px" }
                        : { background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: "14px 14px 14px 3px", padding: "8px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                      <div className="prose prose-xs max-w-none">
                        <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{msg.content}</Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex gap-2">
                  <textarea rows={2} className="flex-1 text-xs rounded-lg px-2.5 py-2 resize-none focus:outline-none"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                    placeholder="Ask or instruct Ariadne…" value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }} />
                  <button onClick={handleChat} disabled={!chatInput.trim() || chatLoading}
                    className="btn-gradient text-xs px-3 rounded-lg disabled:opacity-40 shrink-0">↑</button>
                </div>
              </div>
            </>
          )}

          {/* Insights tab */}
          {rightTab === "insights" && (
            <InsightPanel
              insights={workspace.insights}
              draft={insightDraft}
              onDraftChange={setInsightDraft}
              onAdd={handleAddInsight}
              onDelete={handleDeleteInsight}
            />
          )}

          {/* Research tab */}
          {rightTab === "research" && (
            <ResearchPanel
              todos={workspace.researchTodos}
              sources={workspace.sources}
              draft={todoDraft}
              onDraftChange={setTodoDraft}
              onAdd={handleAddTodo}
              onDelete={handleDeleteTodo}
              onRun={handleRunTodo}
              runningId={runningTodoId}
              onSelectSource={(sourceId) => { setSelectedSourceId(sourceId); setMainTab("source"); }}
            />
          )}
        </div>
      </div>

      {/* Confirm delete source dialog */}
      <ConfirmDialog
        open={confirmDeleteSourceId !== null}
        title={i.confirmDeleteTitle}
        message={i.confirmDeleteSource}
        onConfirm={() => confirmDeleteSourceId && handleDeleteSource(confirmDeleteSourceId)}
        onCancel={() => setConfirmDeleteSourceId(null)}
      />
    </div>
  );
}

// ── Shared UI components ─────────────────────────────────────────────────────

const toolbarBtnStyle = { border: "1px solid var(--color-border)", color: "var(--color-text-dim)", background: "var(--color-surface)" } as const;

function ViewToggle({ current, onChange }: { current: "prose" | "graph"; onChange: (v: "prose" | "graph") => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
      {(["graph", "prose"] as const).map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className="text-xs px-3 py-1.5 transition-colors"
          style={{
            background: current === v ? "var(--color-accent)" : "var(--color-surface)",
            color: current === v ? "var(--color-bg)" : "var(--color-text-dim)",
            fontWeight: current === v ? 600 : 400,
          }}>
          {v === "prose" ? "Prose" : "Graph"}
        </button>
      ))}
    </div>
  );
}

function GraphFloatingToolbar({ title, badge, view, onViewChange, onExport, onRegenerate, regenerating }: {
  title: string;
  badge?: React.ReactNode;
  view: "prose" | "graph";
  onViewChange: (v: "prose" | "graph") => void;
  onExport: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 15,
      padding: "12px 16px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "linear-gradient(to bottom, var(--color-bg), transparent)",
      pointerEvents: "none",
    }}>
      <div className="flex items-center gap-3" style={{ pointerEvents: "auto" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>{title}</span>
        {badge}
      </div>
      <div className="flex items-center gap-2" style={{ pointerEvents: "auto" }}>
        <ViewToggle current={view} onChange={onViewChange} />
        <button onClick={onExport}
          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          style={toolbarBtnStyle} title="Export as Markdown">
          .md
        </button>
        <button onClick={onRegenerate} disabled={regenerating}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
          style={toolbarBtnStyle}>
          {regenerating ? "Weaving…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
}

// ── DigestableRoadmap ─────────────────────────────────────────────────────────

function DigestableRoadmap({ markdown, digestedIds, checkedIds, onToggle }: {
  markdown: string;
  digestedIds: string[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const sections = parseMarkdownSections(markdown);
  if (sections.length === 0) {
    return <article className="prose prose-sm max-w-none"><Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown></article>;
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const digested = digestedIds.includes(section.id);
        const checked = checkedIds.has(section.id);
        const isSubsection = section.level === 3;
        return (
          <div key={section.id}
            onClick={() => !digested && onToggle(section.id)}
            className="rounded-xl border p-4 transition-all"
            style={{
              borderColor: checked ? "var(--color-accent)" : "var(--color-border)",
              background: checked ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))" : "var(--color-surface)",
              opacity: digested ? 0.45 : 1,
              cursor: digested ? "default" : "pointer",
              marginLeft: isSubsection ? 20 : 0,
            }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px]"
                style={{
                  background: digested ? "var(--color-success)" : checked ? "var(--color-accent)" : "var(--color-border)",
                  color: "var(--color-bg)",
                }}>
                {digested ? "✓" : checked ? "✓" : ""}
              </div>
              <span className={`text-xs ${isSubsection ? "" : "font-semibold"}`} style={{ color: "var(--color-text)" }}>{section.heading}</span>
              {digested && <span className="text-[9px] ml-auto" style={{ color: "var(--color-success)" }}>digested</span>}
            </div>
            <div className="prose prose-xs max-w-none" style={{ pointerEvents: "none" }}>
              <Markdown remarkPlugins={[remarkGfm]}>{section.content}</Markdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── InsightPanel ──────────────────────────────────────────────────────────────

function InsightPanel({ insights, draft, onDraftChange, onAdd, onDelete }: {
  insights: Insight[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {insights.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>
            Capture ideas, observations, and insights as you explore.
          </p>
        )}
        {[...insights].reverse().map((ins) => (
          <div key={ins.id} className="group rounded-lg px-3 py-2.5 text-xs leading-relaxed relative"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
            {ins.content}
            {ins.sourceRef && (
              <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                ↳ from source
              </p>
            )}
            <button onClick={() => onDelete(ins.id)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs transition-opacity"
              style={{ color: "var(--color-text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>×</button>
          </div>
        ))}
      </div>
      <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex gap-2">
          <textarea rows={2} className="flex-1 text-xs rounded-lg px-2.5 py-2 resize-none focus:outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            placeholder="Write an insight…" value={draft} onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAdd(); } }} />
          <button onClick={onAdd} disabled={!draft.trim()}
            className="btn-gradient text-xs px-3 rounded-lg disabled:opacity-40 shrink-0">+</button>
        </div>
      </div>
    </>
  );
}

// ── ResearchPanel ─────────────────────────────────────────────────────────────

function ResearchPanel({ todos, sources, draft, onDraftChange, onAdd, onDelete, onRun, runningId, onSelectSource }: {
  todos: ResearchTodo[];
  sources: Source[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  runningId: string | null;
  onSelectSource: (id: string) => void;
}) {
  const statusColor = { pending: "var(--color-text-muted)", "in-progress": "var(--color-warning)", done: "var(--color-success)" };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {todos.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>
            Add specific research questions to deep-dive later.
          </p>
        )}
        {todos.map((todo) => {
          const resultSource = todo.resultSourceId ? sources.find((s) => s.id === todo.resultSourceId) : null;
          return (
            <div key={todo.id} className="group rounded-lg px-3 py-2.5 text-xs relative"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-start gap-2">
                <span className="text-[10px] mt-0.5 shrink-0" style={{ color: statusColor[todo.status] }}>
                  {todo.status === "done" ? "✓" : todo.status === "in-progress" ? "⟳" : "○"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-snug" style={{ color: "var(--color-text)" }}>{todo.topic}</p>
                  {todo.description && <p className="mt-0.5 opacity-60">{todo.description}</p>}
                  {resultSource && (
                    <button onClick={() => onSelectSource(resultSource.id)}
                      className="mt-1 text-[10px] hover:underline" style={{ color: "var(--color-accent)" }}>
                      🔬 {resultSource.reference.slice(0, 40)}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {todo.status !== "done" && (
                    <button onClick={() => onRun(todo.id)} disabled={runningId === todo.id}
                      className="text-[10px] px-2 py-0.5 rounded btn-gradient disabled:opacity-40">
                      {runningId === todo.id ? "…" : "Run"}
                    </button>
                  )}
                  <button onClick={() => onDelete(todo.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                    style={{ color: "var(--color-text-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>×</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex gap-2">
          <input className="flex-1 text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            placeholder="Research topic…" value={draft} onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} />
          <button onClick={onAdd} disabled={!draft.trim()}
            className="btn-gradient text-xs px-3 rounded-lg disabled:opacity-40 shrink-0">+</button>
        </div>
      </div>
    </>
  );
}

// ── SourceItem ────────────────────────────────────────────────────────────────

function SourceItem({ source, selected, checked, generating, digestStatus, onSelect, onCheck, onDelete, onGenerate, i }: {
  source: Source;
  selected: boolean;
  checked: boolean;
  generating: boolean;
  digestStatus: string | null;
  onSelect: () => void;
  onCheck: (v: boolean) => void;
  onDelete: () => void;
  onGenerate: () => void;
  i: ReturnType<typeof t>;
}) {
  return (
    <div
      onClick={onSelect}
      className="group cursor-pointer relative"
      style={{
        borderBottom: "1px solid var(--color-border)",
        background: selected
          ? "color-mix(in srgb, var(--color-accent) 6%, var(--color-surface))"
          : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Selected indicator */}
      {selected && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: 2.5, background: "var(--color-accent)", borderRadius: "0 2px 2px 0",
        }} />
      )}
      <div className="px-3 py-2.5 pl-4">
        <div className="flex items-start gap-1.5">
          <input type="checkbox" checked={checked} onClick={(e) => e.stopPropagation()}
            onChange={(e) => onCheck(e.target.checked)} className="mt-0.5 shrink-0 cursor-pointer" />
          <div className="flex-1 min-w-0">
            {source.type === "url" ? (
              <a href={source.reference} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs leading-snug line-clamp-2 hover:underline block"
                style={{ color: "var(--color-accent)" }}>
                {source.reference.replace(/^https?:\/\//, "").slice(0, 55)}
              </a>
            ) : (
              <p className="text-xs leading-snug line-clamp-2" style={{ color: "var(--color-text)" }}>
                {source.origin === "research" ? "🔬 " : source.type === "file" ? "↑ " : ""}
                {source.reference.slice(0, 75)}{source.reference.length > 75 ? "…" : ""}
              </p>
            )}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-xs shrink-0 mt-0.5 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>×</button>
        </div>
        <div className="flex items-center justify-between mt-1.5 pl-5">
          {source.roadmap ? (
            <span className="text-[10px] font-medium flex items-center gap-1" style={{ color: "var(--color-success)" }}>
              <span style={{ opacity: 0.7 }}>{digestStatus}</span>
              <span style={{ opacity: 0.6 }}>{i.roadmapReady}</span>
            </span>
          ) : (
            <span className="text-[10px]" style={{ color: "var(--color-text-muted)", opacity: 0.4 }}>—</span>
          )}
          {!source.roadmap && (
            <button onClick={(e) => { e.stopPropagation(); onGenerate(); }} disabled={generating}
              className="btn-gradient text-[10px] px-2 py-0.5 rounded-md disabled:opacity-40">
              {generating ? "…" : i.generateSourceRoadmap}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── GeneratePrompt / EmptyState ───────────────────────────────────────────────

const STAGE_KEYS = ["parseInput", "extractSkillTree", "researchSkills", "generateRoadbook"] as const;
const JOURNEY_STAGE_KEYS = ["extractSkillTree", "mergeSkillTrees", "researchSkills", "generateRoadbook"] as const;

const STAGE_LABELS: Record<string, keyof ReturnType<typeof t>> = {
  parseInput: "stageParseInput",
  extractSkillTree: "stageExtractSkillTree",
  mergeSkillTrees: "stageMergeSkillTrees",
  researchSkills: "stageResearchSkills",
  generateRoadbook: "stageGenerateRoadbook",
};

function ProgressIndicator({ progress, stages, i }: { progress: GenerationProgress; stages: readonly string[]; i: ReturnType<typeof t> }) {
  const currentIdx = stages.indexOf(progress.stage);
  return (
    <div className="space-y-2 text-left inline-block">
      {stages.map((stage, idx) => {
        const isDone = idx < currentIdx || (idx === currentIdx && progress.progress === 100);
        const isCurrent = idx === currentIdx && progress.progress !== 100;
        const isPending = idx > currentIdx;
        const label = i[STAGE_LABELS[stage] ?? "loading"];
        return (
          <div key={stage} className="flex items-center gap-2.5 text-xs" style={{ opacity: isPending ? 0.35 : 1 }}>
            {isDone ? (
              <span style={{ color: "var(--color-accent)" }}>✓</span>
            ) : isCurrent ? (
              <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
            ) : (
              <span className="w-3.5 text-center" style={{ color: "var(--color-text-muted)" }}>○</span>
            )}
            <span style={{ color: isCurrent ? "var(--color-text)" : "var(--color-text-muted)" }}>
              {label}
            </span>
            {isCurrent && progress.detail && (
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)", opacity: 0.7 }}>
                {progress.detail}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GeneratePrompt({ generating, onGenerate, i, progress }: { generating: boolean; onGenerate: () => void; i: ReturnType<typeof t>; progress?: GenerationProgress | null }) {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: "var(--color-text-muted)" }}>
      <div className="text-center space-y-4">
        {generating ? (
          progress ? (
            <ProgressIndicator progress={progress} stages={STAGE_KEYS} i={i} />
          ) : (
            <>
              <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
              <p className="text-sm">{i.weavingRoadmap}</p>
            </>
          )
        ) : (
          <>
            <p className="text-sm">{i.readyToGenerate}</p>
            <button onClick={onGenerate} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">{i.generateRoadmap}</button>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAdd, i }: { onAdd: () => void; i: ReturnType<typeof t> }) {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: "var(--color-text-muted)" }}>
      <div className="text-center space-y-3">
        <p className="text-lg">{i.noSourcesYet}</p>
        <p className="text-sm opacity-60">{i.addSourceToStart}</p>
        <button onClick={onAdd} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">{i.addSource}</button>
      </div>
    </div>
  );
}
