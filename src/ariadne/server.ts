import "dotenv/config";
import express from "express";
import cors from "cors";
import { generateRoadbook } from "./workflow.js";
import { setModelConfig } from "./config.js";
import type { ModelProvider } from "./config.js";
import { logTracingStatus } from "./tracing.js";

const app = express();
const PORT = Number(process.env.ARIADNE_PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", engine: "ariadne" });
});

app.post("/generate", async (req, res) => {
  const { input, provider, model } = req.body as {
    input?: string;
    provider?: ModelProvider;
    model?: string;
  };

  if (!input?.trim()) {
    res.status(400).json({ error: "input is required" });
    return;
  }

  if (provider || model) {
    setModelConfig({ provider, modelName: model });
  }

  try {
    const markdown = await generateRoadbook(input);
    res.json({ markdown });
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
