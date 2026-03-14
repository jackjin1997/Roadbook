# Roadbook 路书

> 输入一份 JD，Ariadne 为你生成专属的通关路书。

给技术人用的 AI 学习路径生成器。粘贴一份 JD、一段简历、或任意技术概念，Ariadne 自动提取技能树、联网调研每个知识点，输出一份带交互式技能图谱和推荐资源的结构化路书。

---

## 特色功能

### 射箭靶心技能图谱

D3 力导向图 + 径向布局，灵感来自 [MiroFish](https://github.com/666ghj/MiroFish)：

- **靶心布局**：High priority 技能在中心，Medium 在中环，Low 在外环，三个同心圆可视化优先级
- **展开/收起子技能**：点击节点展开子技能卫星节点（虚线连接），再点收起
- **权重可视化**：节点大小、标签粗细、斥力强度、连边宽度均与 priority 挂钩
- **MiroFish 交互**：粉色高亮选中节点及连边、hover 聚焦、浮动 Node Details 面板
- **学习状态追踪**：双击节点切换 Not Started → Learning → Mastered
- **全面板沉浸**：图谱占满整个主面板，工具栏悬浮在上层

### 多源 Journey 系统

- **多 Source 聚合**：上传多份 JD/文章/PDF，合并生成统一技能路书
- **增量消化**：逐段选择性消化 source 内容到 Journey Roadmap
- **RAG 智能问答**：基于 vector store 的检索增强聊天，支持中英日西法多语言
- **Research Todo**：AI 自动联网调研，生成 🔬 research source

### 更多能力

- **Graph / Prose 双视图**：Source 和 Journey 均支持力导向图 / Markdown 切换
- **Obsidian 导出**：一键导出 `.zip` vault（技能节点 → 独立 `.md` + `[[双链]]`）
- **Skill Radar 雷达页**：跨 workspace 全局技能索引，掌握进度一目了然
- **LangSmith 全链路追踪**：每步生成均可观测

---

## 使用场景

- **JD 解析**：拿到一份岗位要求，不知道从哪学起？生成带优先级的技能路书
- **简历复习**：简历上写了但没吃透的技术点，面试前快速补课
- **概念扫盲**：技术文章中出现的新概念，生成结构化知识图谱
- **Agent 调度**：Claude Code、OpenClaw 等 AI coding agent 可直接通过 CLI 调用

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
GOOGLE_API_KEY=          # 可选（Gemini）
TAVILY_API_KEY=          # 必填，用于联网调研
LANGSMITH_API_KEY=       # 可选，开启 tracing
```

### 3. 启动应用

```bash
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
| 前端 | React 19 + TypeScript + Tailwind CSS 4 |
| 可视化 | D3.js (力导向图 + 径向布局) + Mermaid (脑图) |
| Agent 编排 | LangGraph.js |
| LLM | Gemini / Anthropic / OpenAI（可切换） |
| 联网搜索 | Tavily Search API |
| 数据层 | SQLite (better-sqlite3, WAL 模式) |
| 后端 API | Express 5 (本地 REST + SSE 流) |
| 可观测性 | LangSmith (tracing + evaluation) |

### 工作流

```
输入文本 → ParseInput → ExtractSkillTree → ResearchNode → GenerateRoadbook → 交互式图谱 + Markdown
```

每一步均通过 LangSmith 全链路追踪。

---

## 前端设计

UI 风格参考 [MiroFish](https://github.com/666ghj/MiroFish) 的 Graph Relationship Visualization：

- 黑白灰简约色系 + 点阵底纹背景
- `ROADBOOK` 等宽字体品牌标识
- MiroFish 粉色 (`#E91E63`) 高亮交互
- 浮动毛玻璃工具栏 + 悬浮详情面板
- 10 色实体类型调色板

---

## 开发

```bash
# 运行测试
pnpm test

# 监听模式
pnpm test:watch

# 构建
pnpm build
```

---

## 版本历史

| 版本 | 日期 | 主要内容 |
|---|---|---|
| v0.9 | 2026-03-15 | MiroFish 风格 UI 全面改造 + 射箭靶心径向技能图谱 + 子技能展开收起 + 聊天多语言支持 + SSE 健壮性 |
| v0.8 | 2026-03-12 | SQLite 数据层 (better-sqlite3 WAL + 自动迁移) |
| v0.7 | 2026-03-10 | RAG chat retrieval + GitHub Actions CI |
| v0.6 | 2026-03-08 | 技能图谱可视化 (D3 force graph) + Skill Radar 页 + Obsidian 导出 + 学习进度追踪 |
| v0.5 | 2026-03-06 | 实时进度流 + Research 可靠性 + 消化粒度细化 |
| v0.4 | 2026-03-04 | 多 Source Journey 系统 (生成/消化/Insight/Research Todo/多源 Chat) |
| v0.1 | 2026-02 | 核心工作流、多模型支持、历史记录、CLI |

详见 [TASKS.md](./TASKS.md) 和 [PRD.md](./docs/PRD.md)。
