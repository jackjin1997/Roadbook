import "dotenv/config";
import { generateRoadbook } from "./workflow.js";
import { setModelConfig } from "./config.js";
import type { ModelProvider } from "./config.js";
import { logTracingStatus } from "./tracing.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Ariadne CLI - 路书生成引擎

用法:
  npx tsx src/ariadne/cli.ts <input-text> [options]

选项:
  --provider <openai|anthropic|gemini>  选择 LLM 提供商 (默认: openai)
  --model <model-name>                  指定模型名称
  --output <path>                       输出文件路径 (默认: output/roadbook.md)
  --help                                显示帮助信息

示例:
  npx tsx src/ariadne/cli.ts "Node.js 高级后端工程师"
  npx tsx src/ariadne/cli.ts "React, TypeScript, Next.js" --provider anthropic
`);
    process.exit(0);
  }

  let input = "";
  let outputPath = "output/roadbook.md";
  const modelConfig: { provider?: ModelProvider; modelName?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      modelConfig.provider = args[++i] as ModelProvider;
    } else if (args[i] === "--model" && args[i + 1]) {
      modelConfig.modelName = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[++i];
    } else if (!args[i].startsWith("--")) {
      input += (input ? " " : "") + args[i];
    }
  }

  if (!input) {
    console.error("错误: 请提供输入文本");
    process.exit(1);
  }

  if (modelConfig.provider || modelConfig.modelName) {
    setModelConfig(modelConfig);
  }

  console.log("🧶 Ariadne 正在为你编织路书...\n");
  console.log(`  输入: ${input.slice(0, 80)}${input.length > 80 ? "..." : ""}`);
  console.log(`  模型: ${modelConfig.provider ?? "openai"}`);
  logTracingStatus();
  console.log();

  const startTime = Date.now();

  try {
    const output = await generateRoadbook(input);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const dir = join(process.cwd(), outputPath.split("/").slice(0, -1).join("/"));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const fullPath = join(process.cwd(), outputPath);
    writeFileSync(fullPath, output.markdown, "utf-8");

    console.log(`✅ 路书生成完成 (${elapsed}s)`);
    console.log(`📄 已保存到: ${fullPath}`);
  } catch (err) {
    console.error("❌ 生成失败:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
