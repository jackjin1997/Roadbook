import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

import { logTracingStatus } from "./tracing.js";
import skillRoutes from "./routes/skills.js";
import workspaceRoutes from "./routes/workspaces.js";
import sourceRoutes from "./routes/sources.js";
import chatRoutes from "./routes/chat.js";
import journeyRoutes from "./routes/journey.js";
import toolRoutes from "./routes/tools.js";

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
const PORT = Number(process.env.ARIADNE_PORT) || 3001;

const CORS_ORIGIN = process.env.CORS_ORIGIN;
app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN.split(",") } : undefined));
app.use(express.json({ limit: "2mb" }));

// Mount skill routes (skill-events, skill-index)
app.use("/", skillRoutes);

// Mount workspace CRUD routes
app.use("/workspaces", workspaceRoutes);

// Mount source routes (nested under /workspaces)
app.use("/workspaces", sourceRoutes);

// Mount chat routes (nested under /workspaces)
app.use("/workspaces", chatRoutes);

// Mount journey routes (nested under /workspaces)
app.use("/workspaces", journeyRoutes);

// Mount tools routes (insights, research-todos, skill-progress — nested under /workspaces)
app.use("/workspaces", toolRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", engine: "ariadne" });
});

// List available models from the OpenAI-compatible proxy
app.get("/models", async (_req, res) => {
  const models: string[] = [];

  // Gemini models (direct Google API) — only expose cheap flash models in production
  if (process.env.GOOGLE_API_KEY) {
    models.push("gemini-2.5-flash", "gemini-3-flash-preview");
  }

  // Try OpenAI-compatible proxy if configured
  if (process.env.OPENAI_BASE_URL) {
    try {
      const base = process.env.OPENAI_BASE_URL;
      const r = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data = await r.json() as { data: { id: string }[] };
        for (const m of data.data) {
          if (!models.includes(m.id)) models.push(m.id);
        }
      }
    } catch { /* proxy unavailable, skip */ }
  }

  if (models.length === 0) models.push("gemini-3-flash-preview");
  res.json({ models });
});

// ── Production: serve frontend static files ──────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../../dist");

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath));
  app.get("{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

export { app };

if (process.env.NODE_ENV !== "test") {
  const HOST = process.env.HOST || "0.0.0.0";
  app.listen(PORT, HOST, () => {
    console.log(`\n🧶 Ariadne engine running at http://${HOST}:${PORT}`);
    logTracingStatus();
    console.log();
  });
}
