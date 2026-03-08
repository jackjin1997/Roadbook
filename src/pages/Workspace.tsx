import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getWorkspace,
  renameWorkspace,
  addSource,
  addUrlSource,
  addFileSource,
  deleteSource,
  generateRoadmap,
  listModels,
  sendChatMessage,
} from "../api";
import type { ChatMessage } from "../api";
import type { Workspace, Source } from "../types";
import ResizeHandle from "../components/ResizeHandle";
import { useLanguage } from "../contexts/LanguageContext";
import { t, LANGUAGES } from "../i18n";

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sourceWidth, setSourceWidth] = useState(220);
  const [chatWidth, setChatWidth] = useState(340);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const resizeSources = useCallback((delta: number) => {
    setSourceWidth((w) => Math.max(160, Math.min(400, w + delta)));
  }, []);
  const resizeChat = useCallback((delta: number) => {
    setChatWidth((w) => Math.max(220, Math.min(600, w + delta)));
  }, []);
  const { language, setLanguage } = useLanguage();
  const i = t(language);


  useEffect(() => {
    if (!id) return;
    getWorkspace(id).then((ws) => {
      setWorkspace(ws);
      setTitleDraft(ws.title);
      if (ws.sources.length > 0) setSelectedSourceId(ws.sources[0].id);
    });
    listModels().then(({ models }) => {
      setModels(models);
      if (models.length > 0) setSelectedModel(models.find(m => m === "gemini-3.1-pro-low") ?? models[0]);
    });
  }, [id]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const selectedSource = workspace?.sources.find((s) => s.id === selectedSourceId) ?? null;

  const handleRename = async () => {
    if (!workspace || !titleDraft.trim()) { setEditingTitle(false); return; }
    const updated = await renameWorkspace(workspace.id, titleDraft.trim());
    setWorkspace((w) => w ? { ...w, title: updated.title } : w);
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
    } finally {
      setAddingSource(false);
    }
  };

  const handleAddFile = async (file: File) => {
    if (!workspace) return;
    setAddingSource(true);
    try {
      const source = await addFileSource(workspace.id, file, language);
      setWorkspace((w) => w ? { ...w, sources: [...w.sources, source] } : w);
      setSelectedSourceId(source.id);
      setShowAddSource(false);
    } finally {
      setAddingSource(false);
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!workspace) return;
    await deleteSource(workspace.id, sourceId);
    const remaining = workspace.sources.filter((s) => s.id !== sourceId);
    setWorkspace((w) => w ? { ...w, sources: remaining } : w);
    if (selectedSourceId === sourceId) {
      setSelectedSourceId(remaining[0]?.id ?? null);
    }
  };

  const handleGenerate = async (sourceId: string) => {
    if (!workspace) return;
    setGeneratingId(sourceId);
    try {
      const { roadmap, workspaceTitle } = await generateRoadmap(workspace.id, sourceId, selectedModel || undefined);
      setWorkspace((w) => {
        if (!w) return w;
        return {
          ...w,
          title: workspaceTitle,
          sources: w.sources.map((s) =>
            s.id === sourceId ? { ...s, roadmap } : s
          ),
        };
      });
      setTitleDraft(workspaceTitle);
    } finally {
      setGeneratingId(null);
    }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleChat = async () => {
    if (!workspace || !chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const next = [...chatMessages, userMsg];
    setChatMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await sendChatMessage(workspace.id, next, selectedSourceId ?? undefined);
      const aiMsg: ChatMessage = { role: "assistant", content: res.reply };
      setChatMessages([...next, aiMsg]);
      if (res.roadbookUpdated && res.roadmap && selectedSourceId) {
        setWorkspace((w) => w ? {
          ...w,
          sources: w.sources.map((s) => s.id === selectedSourceId ? { ...s, roadmap: res.roadmap } : s),
        } : w);
      }
    } finally {
      setChatLoading(false);
    }
  };

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ color: "var(--color-text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
        style={{ borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => navigate("/")}
          className="text-sm font-bold gradient-text"
        >
          Roadbook
        </button>

        <span style={{ color: "var(--color-border)" }}>/</span>

        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingTitle(false); }}
            className="text-sm font-medium bg-transparent border-b focus:outline-none px-1"
            style={{ color: "var(--color-text)", borderColor: "var(--color-accent)", minWidth: 200 }}
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="text-sm font-medium hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text)" }}
            title="Click to rename"
          >
            {workspace.title}
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {models.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                maxWidth: 180,
              }}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
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

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Sources panel */}
        <div
          className="flex flex-col shrink-0"
          style={{ width: sourceWidth, borderRight: "none" }}
        >
          <div
            className="px-3 py-2.5 text-xs font-medium border-b flex items-center justify-between"
            style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}
          >
            {i.sources}
            <button
              onClick={() => setShowAddSource(true)}
              className="btn-gradient text-xs px-2.5 py-1 rounded-lg font-medium"
            >
              {i.addSource}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {workspace.sources.length === 0 && !showAddSource && (
              <p className="px-3 py-6 text-xs text-center" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>
                {i.noSourcesYet}
              </p>
            )}

            {workspace.sources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                selected={selectedSourceId === source.id}
                generating={generatingId === source.id}
                onSelect={() => setSelectedSourceId(source.id)}
                onDelete={() => handleDeleteSource(source.id)}
                onGenerate={() => handleGenerate(source.id)}
                i={i}
              />
            ))}
          </div>

          {/* Add source form */}
          {showAddSource && (
            <div
              className="p-3 border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="relative">
                <textarea
                  autoFocus
                  className="w-full text-xs rounded p-2 resize-none focus:outline-none"
                  style={{
                    background: "var(--color-bg)",
                    border: `1px solid ${isUrl(sourceDraft) ? "var(--color-accent)" : "var(--color-border)"}`,
                    color: "var(--color-text)",
                    height: 90,
                  }}
                  placeholder={i.pasteHint}
                  value={sourceDraft}
                  onChange={(e) => setSourceDraft(e.target.value)}
                />
                {isUrl(sourceDraft) && (
                  <span className="absolute top-1.5 right-2 text-[9px] font-medium px-1.5 py-0.5 rounded"
                    style={{ background: "var(--color-accent)", color: "#fff" }}>
                    URL
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleAddSource}
                  disabled={!sourceDraft.trim() || addingSource}
                  className="btn-gradient flex-1 text-xs py-1.5 rounded-lg font-medium"
                >
                  {addingSource ? i.adding : i.addSource.replace("+ ", "")}
                </button>
                {/* File upload */}
                <label
                  className="text-xs py-1.5 px-2.5 rounded cursor-pointer transition-colors flex items-center"
                  style={{ background: "var(--color-surface-hover)", color: "var(--color-text-muted)" }}
                  title="Upload file (PDF, DOCX, TXT, image)"
                >
                  ↑
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md,image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAddFile(f); e.target.value = ""; }}
                  />
                </label>
                <button
                  onClick={() => { setShowAddSource(false); setSourceDraft(""); }}
                  className="text-xs py-1.5 px-3 rounded transition-colors"
                  style={{ background: "var(--color-surface-hover)", color: "var(--color-text-muted)" }}
                >
                  {i.cancel}
                </button>
              </div>
            </div>
          )}
        </div>

        <ResizeHandle onResize={resizeSources} />

        {/* Roadmap panel */}
        <div className="flex-1 overflow-auto" style={{ background: "var(--color-surface)" }}>
          {!selectedSource ? (
            <EmptyState i={i} onAdd={() => setShowAddSource(true)} />
          ) : selectedSource.roadmap ? (
            <div className="p-8 max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {i.generated} {formatDate(selectedSource.roadmap.generatedAt)}
                </p>
                <button
                  onClick={() => handleGenerate(selectedSource.id)}
                  disabled={generatingId === selectedSource.id}
                  className="text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}
                >
                  {generatingId === selectedSource.id ? i.regenerating : i.regenerate}
                </button>
              </div>
              <article className="prose prose-sm max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {selectedSource.roadmap.markdown}
                </Markdown>
              </article>
            </div>
          ) : (
            <GeneratePrompt
              i={i}
              generating={generatingId === selectedSource.id}
              onGenerate={() => handleGenerate(selectedSource.id)}
            />
          )}
        </div>

        <ResizeHandle onResize={resizeChat} />

        {/* Chat panel */}
        <div
          className="flex flex-col shrink-0"
          style={{ width: chatWidth, background: "var(--color-bg)" }}
        >
          <div
            className="px-3 py-2.5 text-xs font-medium border-b shrink-0"
            style={{ color: "var(--color-text-muted)", borderColor: "var(--color-border)" }}
          >
            Chat · Ariadne
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-xs text-center mt-8" style={{ color: "var(--color-text-muted)", opacity: 0.5 }}>
                Ask Ariadne anything about this journey, or request roadbook changes.
              </p>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="text-xs rounded-xl px-3 py-2 max-w-[85%] leading-relaxed"
                  style={msg.role === "user" ? {
                    background: "var(--color-accent)",
                    color: "#fff",
                    borderRadius: "12px 12px 3px 12px",
                  } : {
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px 12px 12px 3px",
                  }}
                >
                  <div className="prose prose-xs max-w-none">
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                  </div>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="text-xs px-3 py-2 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                  <span className="animate-pulse">···</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex gap-2">
              <textarea
                rows={2}
                className="flex-1 text-xs rounded-lg px-2.5 py-2 resize-none focus:outline-none"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
                placeholder="Ask or instruct Ariadne..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); }
                }}
              />
              <button
                onClick={handleChat}
                disabled={!chatInput.trim() || chatLoading}
                className="btn-gradient text-xs px-3 rounded-lg disabled:opacity-40 shrink-0"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceItem({
  source,
  selected,
  generating,
  onSelect,
  onDelete,
  onGenerate,
  i,
}: {
  source: Source;
  selected: boolean;
  generating: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onGenerate: () => void;
  i: ReturnType<typeof t>;
}) {
  return (
    <div
      onClick={onSelect}
      className="group px-3 py-2.5 cursor-pointer border-b"
      style={{
        borderColor: "var(--color-border)",
        background: selected ? "var(--color-surface)" : "transparent",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        {source.type === "url" ? (
          <a
            href={source.reference}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs leading-relaxed line-clamp-2 flex-1 hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            {source.reference.replace(/^https?:\/\//, "").slice(0, 60)}
          </a>
        ) : (
          <p
            className="text-xs leading-relaxed line-clamp-2 flex-1"
            style={{ color: "var(--color-text)" }}
          >
            {source.type === "file" ? "↑ " : ""}{source.reference.slice(0, 80)}{source.reference.length > 80 ? "..." : ""}
          </p>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 text-xs shrink-0 mt-0.5 transition-opacity"
          style={{ color: "var(--color-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          ×
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span
          className="text-[10px]"
          style={{ color: source.roadmap ? "#10b981" : "var(--color-text-muted)", opacity: source.roadmap ? 1 : 0.5 }}
        >
          {source.roadmap ? i.roadmapReady : "—"}
        </span>
        {!source.roadmap && (
          <button
            onClick={(e) => { e.stopPropagation(); onGenerate(); }}
            disabled={generating}
            className="btn-gradient text-[10px] px-1.5 py-0.5 rounded-md disabled:opacity-40"
          >
            {generating ? "..." : "→"}
          </button>
        )}
      </div>
    </div>
  );
}

function GeneratePrompt({ generating, onGenerate, i }: {
  generating: boolean;
  onGenerate: () => void;
  i: ReturnType<typeof t>;
}) {
  return (
    <div className="flex items-center justify-center h-full" style={{ color: "var(--color-text-muted)" }}>
      <div className="text-center space-y-4">
        {generating ? (
          <>
            <div
              className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
            />
            <p className="text-sm">{i.weavingRoadmap}</p>
          </>
        ) : (
          <>
            <p className="text-sm">{i.readyToGenerate}</p>
            <button onClick={onGenerate} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">
              {i.generateRoadmap}
            </button>
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
        <button onClick={onAdd} className="btn-gradient px-5 py-2 rounded-lg text-sm font-medium">
          {i.addSource}
        </button>
      </div>
    </div>
  );
}
