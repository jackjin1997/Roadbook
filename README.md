# Roadbook 路书

> 输入一份 JD，Ariadne 为你生成专属的通关路书。

给技术人用的 AI 学习路径生成器。粘贴一份 JD、一段简历、或任意技术概念，Ariadne 自动提取技能树、联网调研每个知识点，输出一份带 Mermaid 脑图和推荐资源的结构化路书。

---

## 使用场景

- **JD 解析**：拿到一份岗位要求，不知道从哪学起？生成带优先级的技能路书
- **简历复习**：简历上写了但没吃透的技术点，面试前快速补课
- **概念扫盲**：技术文章中出现的新概念，生成结构化知识图谱
- **Agent 调度**：Claude Code、OpenClaw 等 AI coding agent 可直接通过 CLI 调用，将路书生成作为 workflow 中的工具节点

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 API Key：

```env
ANTHROPIC_API_KEY=       # 默认模型，推荐
OPENAI_API_KEY=          # 可选
GOOGLE_API_KEY=          # 可选
TAVILY_API_KEY=          # 必填，用于联网调研
LANGSMITH_API_KEY=       # 可选，开启 tracing
```

### 3. 启动应用

需要两个终端：

```bash
# 终端 1 - 后端引擎
pnpm dev:server

# 终端 2 - 前端界面
pnpm dev
```

打开 http://localhost:1420，粘贴内容，点击「生成路书」。

---

## CLI 使用

适合轻量开发者和 AI agent 直接调用：

```bash
# 基本用法
pnpm ariadne "Node.js 高级后端工程师 JD 内容..."

# 指定模型
pnpm ariadne "React, TypeScript, Next.js" -- --provider anthropic
pnpm ariadne "Python 数据工程师" -- --provider gemini

# 指定输出路径
pnpm ariadne "LangGraph.js" -- --output ./output/langgraph.md
```

结果默认保存到 `output/roadbook.md`。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 前端 | React 19 + TypeScript + TailwindCSS |
| Agent 编排 | LangGraph.js |
| LLM | Anthropic / OpenAI / Gemini（可切换） |
| 联网搜索 | Tavily Search API |
| 可观测性 | LangSmith（tracing + evaluation） |
| 后端 API | Express（本地 REST 服务） |

### 工作流

```
输入文本 → ParseInput → ExtractSkillTree → ResearchNode → GenerateRoadbook → Markdown 输出
```

每一步均通过 LangSmith 全链路追踪。

---

## 开发

```bash
# 运行测试
npm test

# 监听模式
pnpm test:watch

# 类型检查
pnpm build
```

---

## 版本规划

| 版本 | 状态 | 主要内容 |
|---|---|---|
| v0.1 | 已发布 | 核心工作流、多模型支持、历史记录、CLI |
| v0.2 | 规划中 | 流式输出、Obsidian 双链、CLI JSON 模式 |
| v0.3+ | 规划中 | 知识图谱持久化、Obsidian 插件、社区模板 |

详见 [PRD.md](./docs/PRD.md)。
