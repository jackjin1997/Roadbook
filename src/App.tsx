import { useState, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = "http://localhost:3001";

type Status = "idle" | "running" | "done" | "error";

interface HistoryItem {
  id: string;
  input: string;
  markdown: string;
  createdAt: number;
}

async function callAriadne(input: string): Promise<{ markdown: string; id: string }> {
  const res = await fetch(`${API_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchHistory(): Promise<HistoryItem[]> {
  const res = await fetch(`${API_URL}/history`);
  if (!res.ok) return [];
  return res.json();
}

async function deleteHistoryItem(id: string) {
  await fetch(`${API_URL}/history/${id}`, { method: "DELETE" });
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory().then(setHistory);
  }, []);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setStatus("running");
    setResult("");
    setError("");
    setActiveId(null);

    try {
      const { markdown, id } = await callAriadne(input);
      setResult(markdown);
      setActiveId(id);
      setStatus("done");
      fetchHistory().then(setHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleSelectHistory = (item: HistoryItem) => {
    setResult(item.markdown);
    setInput(item.input);
    setActiveId(item.id);
    setStatus("done");
    setError("");
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteHistoryItem(id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (activeId === id) {
      setResult("");
      setStatus("idle");
      setActiveId(null);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)]">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-[var(--color-accent)]">Roadbook</span>
          <span className="text-[var(--color-text-muted)] font-normal ml-2 text-sm">
            路书
          </span>
        </h1>
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">
          Powered by Ariadne
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* History Sidebar */}
        <div className="w-[200px] flex flex-col border-r border-[var(--color-border)] shrink-0">
          <div className="px-3 py-3 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            历史记录
          </div>
          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--color-text-muted)]/50 text-center">
                暂无记录
              </p>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectHistory(item)}
                  className={`group px-3 py-2.5 cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors ${
                    activeId === item.id ? "bg-[var(--color-surface)]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs text-[var(--color-text)] line-clamp-2 leading-relaxed flex-1">
                      {item.input.slice(0, 60)}
                      {item.input.length > 60 ? "..." : ""}
                    </p>
                    <button
                      onClick={(e) => handleDeleteHistory(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-red-400 transition-opacity shrink-0 text-xs leading-none mt-0.5"
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)]/60 mt-1">
                    {formatTime(item.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Input Panel */}
        <div className="w-[380px] flex flex-col border-r border-[var(--color-border)] shrink-0">
          <div className="px-4 py-3 text-sm font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            输入 JD / 文章 / 技术概念
          </div>
          <textarea
            className="flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed focus:outline-none placeholder:text-[var(--color-text-muted)]/50"
            placeholder="粘贴一份 JD、一段技术文章、或输入一个你想深入了解的技术概念..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status === "running"}
          />
          <div className="p-4 border-t border-[var(--color-border)]">
            <button
              onClick={handleGenerate}
              disabled={!input.trim() || status === "running"}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors
                bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === "running" ? "生成中..." : "生成路书"}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="flex-1 overflow-auto p-6">
          {status === "idle" && (
            <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
              <div className="text-center space-y-2">
                <p className="text-lg">输入内容，生成你的专属路书</p>
                <p className="text-sm opacity-60">
                  支持 JD 解析、简历复习、概念扫盲
                </p>
              </div>
            </div>
          )}

          {status === "running" && (
            <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
              <div className="text-center space-y-3">
                <div className="inline-block w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                <p>Ariadne 正在为你编织路书...</p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <p className="font-medium mb-1">生成失败</p>
              <p>{error}</p>
            </div>
          )}

          {status === "done" && result && (
            <article className="prose prose-invert prose-sm max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{result}</Markdown>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
