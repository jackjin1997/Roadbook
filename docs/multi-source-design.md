# Multi-Source Roadmap & Context Design

> 状态：设计中 | 更新：2026-03-08

---

## 核心心智模型

```
Journey (Workspace)
│
├── journey roadmap          ← 对"这件事"的整体梳理，跨 source 合并生成
│
└── sources[]
      ├── source A + source roadmap A   ← 针对这篇文章的局部学习路径
      ├── source B + source roadmap B
      └── source C + source roadmap C
```

- **Source roadmap**：单篇内容的局部视图，聚焦该文章/JD 本身
- **Journey roadmap**：workspace 级别的全局视图，代表对整件事的系统性梳理
- 两者独立存在，互不覆盖

---

## 功能一：Journey Roadmap（多 source 合并生成）

### 数据模型变更

```ts
interface Workspace {
  // 新增
  roadmap: Roadmap | null          // journey 级别的合并 roadmap
  roadmapSourceIds: string[]       // 生成时使用的 source id 列表，用于溯源
}
```

### 合并策略：Map-Reduce

不做简单文本拼接，而是在 skill tree 层面合并，避免超长 context 问题。

```
Step 1: Map（并行）
  source A → extractSkillTree → skillTree A
  source B → extractSkillTree → skillTree B
  source C → extractSkillTree → skillTree C

Step 2: Reduce
  [skillTree A, B, C] → mergeSkillTrees → unified skillTree
    - 按 name 去重
    - 合并同类 category
    - 重新计算 priority（多个 source 都标 high 的优先）
    - 合并 subSkills / relatedConcepts

Step 3: 复用现有流程
  unified skillTree → researchSkills → generateRoadbook
```

### 新增 LangGraph 节点：`mergeSkillTrees`

```ts
// 输入：多个 skillTree 数组
// 输出：去重、归一化后的单一 skillTree
async function mergeSkillTrees(
  state: { skillTrees: SkillNode[][] }
): Promise<{ skillTree: SkillNode[] }>
```

合并规则：
1. **去重**：`name` 相同（大小写不敏感）视为同一节点
2. **priority 提升**：同一节点在多个 source 中出现，priority 取最高
3. **subSkills 合并**：union 去重
4. **relatedConcepts 合并**：union 去重，最多保留 5 个
5. **输出上限**：最多 20 个节点，按 priority + 出现频次排序

### API

```
POST /workspaces/:id/generate-journey
Body: { sourceIds: string[], model?: string }
Response: { roadmap: Roadmap, workspaceTitle: string }
```

### UI

- Source 列表支持多选（checkbox，hover 显示）
- 选中 ≥1 个 source 时，底部出现「生成 Journey Roadmap」按钮
- 主面板顶部 tab：`Journey` | `Source`（单选 source 时只显示 Source）
- Journey tab 显示 workspace 级 roadmap，Source tab 显示当前选中 source 的 roadmap

---

## 功能二：多 source 聊天上下文（渐进式加载）

### 设计原则

不是把所有原文一次性塞进 prompt，而是按信息密度优先级分层注入，在 context 预算内尽量多塞高价值内容。

### 上下文加载策略（Phase 1）

**预算**：60,000 字符（约 15k tokens，留 context 余量给对话历史）

**注入优先级**（按顺序填充，超出预算停止）：

```
Priority 1 — Journey roadmap（若存在）
  workspace.roadmap.markdown（最多 8,000 chars）

Priority 2 — 各 selected source 的 roadmap
  source.roadmap.markdown（每个最多 6,000 chars）

Priority 3 — 各 selected source 的原文 snapshot
  source.snapshot（剩余预算按 source 数量均分）

Priority 4 — 超出预算的 source
  仅注入一行：「[Source: {reference} — 原文超出上下文限制，未加载]」
```

### 实现

```ts
function buildMultiSourceContext(
  journeyRoadmap: Roadmap | null,
  sources: Source[],
  budget = 60_000,
): string {
  let ctx = "";

  // P1: journey roadmap
  if (journeyRoadmap) {
    const chunk = `## Journey Roadmap\n${journeyRoadmap.markdown}`;
    ctx += chunk.slice(0, 8_000) + "\n\n";
  }

  // P2: source roadmaps
  for (const s of sources) {
    if (!s.roadmap) continue;
    const chunk = `## Roadmap: ${s.reference}\n${s.roadmap.markdown}`;
    const remaining = budget - ctx.length;
    if (remaining < 200) break;
    ctx += chunk.slice(0, Math.min(6_000, remaining)) + "\n\n";
  }

  // P3: source snapshots（均分剩余预算）
  const snapSources = sources.filter((s) => s.snapshot);
  const perSource = Math.floor((budget - ctx.length) / Math.max(snapSources.length, 1));
  for (const s of snapSources) {
    const remaining = budget - ctx.length;
    if (remaining < 200) {
      ctx += `[Source: ${s.reference} — 原文超出上下文限制，未加载]\n\n`;
      continue;
    }
    const chunk = `## Source: ${s.reference}\n${s.snapshot}`;
    ctx += chunk.slice(0, Math.min(perSource, remaining)) + "\n\n";
  }

  return ctx.trim();
}
```

### Chat API 变更

```
POST /workspaces/:id/chat/stream
Body: { messages, sourceIds: string[] }   // sourceIds 替代单个 sourceId
```

### Phase 2：RAG 分块（后期）

当 source 数量多或单篇原文超长时，全文加载策略效率低。Phase 2 引入向量检索：

- Source 入库时做分块（chunk size ~500 tokens，overlap ~50）
- 使用 `@langchain/community` 的 `MemoryVectorStore`（zero-dependency，存内存/文件）
- Chat 时：user query → embed → 各 source 召回 top-k chunks → 替代全文注入
- 可渐进迁移：先对超长 source（>10k chars）启用 RAG，短 source 继续全文加载

---

## 实现优先级

| 功能 | 优先级 | 依赖 |
|------|--------|------|
| Workspace 数据模型加 roadmap 字段 | P0 | — |
| mergeSkillTrees 节点 | P1 | 数据模型 |
| Journey generate API | P1 | mergeSkillTrees |
| 多 source chat API（sourceIds） | P1 | — |
| 渐进式 context 加载 | P1 | 多 source chat |
| UI：source 多选 + Journey tab | P2 | Journey API |
| RAG 分块 | P3 | Phase 2 |
