import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { generateRoadbook } from "./workflow.js";
import { setModelConfig } from "./config.js";
import type { ModelProvider } from "./config.js";
import { logTracingStatus } from "./tracing.js";

const app = express();
const PORT = Number(process.env.ARIADNE_PORT) || 3001;

// History persistence
interface HistoryItem {
  id: string;
  input: string;
  markdown: string;
  createdAt: number;
}

const DATA_DIR = join(process.cwd(), "data");
const HISTORY_FILE = join(DATA_DIR, "history.json");

function loadHistory(): HistoryItem[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryItem[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", engine: "ariadne" });
});

app.get("/history", (_req, res) => {
  res.json(loadHistory());
});

app.delete("/history/:id", (req, res) => {
  const history = loadHistory().filter((h) => h.id !== req.params.id);
  saveHistory(history);
  res.json({ ok: true });
});

app.post("/generate", async (req, res) => {
  const { input, provider, model, language } = req.body as {
    input?: string;
    provider?: ModelProvider;
    model?: string;
    language?: string;
  };

  if (!input?.trim()) {
    res.status(400).json({ error: "input is required" });
    return;
  }

  if (provider || model) {
    setModelConfig({ provider, modelName: model });
  }

  try {
    const markdown = await generateRoadbook(input, language ?? "English");

    const item: HistoryItem = {
      id: Date.now().toString(),
      input: input.trim(),
      markdown,
      createdAt: Date.now(),
    };
    const history = loadHistory();
    saveHistory([item, ...history]);

    res.json({ markdown, id: item.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Generation failed:", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🧶 Ariadne engine running at http://localhost:${PORT}`);
  logTracingStatus();
  console.log();
});
