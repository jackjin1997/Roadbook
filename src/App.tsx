import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = "http://localhost:3001";

type Status = "idle" | "running" | "done" | "error";

async function callAriadne(input: string): Promise<string> {
  const res = await fetch(`${API_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.markdown;
}

function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setStatus("running");
    setResult("");
    setError("");

    try {
      const roadbook = await callAriadne(input);
      setResult(roadbook);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
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
        {/* Input Panel */}
        <div className="w-[420px] flex flex-col border-r border-[var(--color-border)] shrink-0">
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
