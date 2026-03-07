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

const LANGUAGES: { value: string; label: string }[] = [
  { value: "English", label: "English" },
  { value: "Chinese (Simplified)", label: "中文" },
  { value: "Japanese", label: "日本語" },
  { value: "Spanish", label: "Español" },
  { value: "French", label: "Français" },
];

interface UIStrings {
  inputPanelTitle: string;
  placeholder: string;
  generate: string;
  generating: string;
  history: string;
  noHistory: string;
  idleTitle: string;
  idleSubtitle: string;
  generatingMsg: string;
  errorTitle: string;
}

const UI: Record<string, UIStrings> = {
  "English": {
    inputPanelTitle: "Input JD / Article / Concept",
    placeholder: "Paste a job description, a technical article, or a concept you want to understand...",
    generate: "Generate Roadbook",
    generating: "Generating...",
    history: "History",
    noHistory: "No records yet",
    idleTitle: "Enter content to generate your roadbook",
    idleSubtitle: "Supports JD parsing, resume review, concept mapping",
    generatingMsg: "Ariadne is weaving your roadbook...",
    errorTitle: "Generation failed",
  },
  "Chinese (Simplified)": {
    inputPanelTitle: "输入 JD / 文章 / 技术概念",
    placeholder: "粘贴一份 JD、一段技术文章、或输入一个你想深入了解的技术概念...",
    generate: "生成路书",
    generating: "生成中...",
    history: "历史记录",
    noHistory: "暂无记录",
    idleTitle: "输入内容，生成你的专属路书",
    idleSubtitle: "支持 JD 解析、简历复习、概念扫盲",
    generatingMsg: "Ariadne 正在为你编织路书...",
    errorTitle: "生成失败",
  },
  "Japanese": {
    inputPanelTitle: "JD / 記事 / 概念を入力",
    placeholder: "求人票、技術記事、または深く理解したい概念を貼り付けてください...",
    generate: "ロードブックを生成",
    generating: "生成中...",
    history: "履歴",
    noHistory: "記録なし",
    idleTitle: "コンテンツを入力してロードブックを生成",
    idleSubtitle: "JD 解析・履歴書レビュー・概念マッピングに対応",
    generatingMsg: "Ariadne があなたのロードブックを編んでいます...",
    errorTitle: "生成失敗",
  },
  "Spanish": {
    inputPanelTitle: "Ingresa JD / Artículo / Concepto",
    placeholder: "Pega una descripción de trabajo, artículo técnico, o concepto que quieras entender...",
    generate: "Generar Roadbook",
    generating: "Generando...",
    history: "Historial",
    noHistory: "Sin registros",
    idleTitle: "Ingresa contenido para generar tu roadbook",
    idleSubtitle: "Soporta análisis de JD, revisión de CV, mapeo de conceptos",
    generatingMsg: "Ariadne está tejiendo tu roadbook...",
    errorTitle: "Error al generar",
  },
  "French": {
    inputPanelTitle: "Entrer JD / Article / Concept",
    placeholder: "Collez une fiche de poste, un article technique, ou un concept à explorer...",
    generate: "Générer le Roadbook",
    generating: "Génération...",
    history: "Historique",
    noHistory: "Aucun enregistrement",
    idleTitle: "Entrez du contenu pour générer votre roadbook",
    idleSubtitle: "Analyse de JD, révision de CV, cartographie de concepts",
    generatingMsg: "Ariadne tisse votre roadbook...",
    errorTitle: "Échec de génération",
  },
};

async function callAriadne(input: string, language: string): Promise<{ markdown: string; id: string }> {
  const res = await fetch(`${API_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, language }),
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
  const [language, setLanguage] = useState("English");
  const t = UI[language] ?? UI["English"];

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
      const { markdown, id } = await callAriadne(input, language);
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
        <div className="ml-auto flex items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={status === "running"}
            className="text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] rounded px-2 py-1 focus:outline-none cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--color-text-muted)]">Powered by Ariadne</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* History Sidebar */}
        <div className="w-[200px] flex flex-col border-r border-[var(--color-border)] shrink-0">
          <div className="px-3 py-3 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            {t.history}
          </div>
          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--color-text-muted)]/50 text-center">
                {t.noHistory}
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
            {t.inputPanelTitle}
          </div>
          <textarea
            className="flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed focus:outline-none placeholder:text-[var(--color-text-muted)]/50"
            placeholder={t.placeholder}
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
              {status === "running" ? t.generating : t.generate}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="flex-1 overflow-auto p-6">
          {status === "idle" && (
            <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
              <div className="text-center space-y-2">
                <p className="text-lg">{t.idleTitle}</p>
                <p className="text-sm opacity-60">{t.idleSubtitle}</p>
              </div>
            </div>
          )}

          {status === "running" && (
            <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
              <div className="text-center space-y-3">
                <div className="inline-block w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                <p>{t.generatingMsg}</p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <p className="font-medium mb-1">{t.errorTitle}</p>
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
