# Journey System Design

> 状态：设计定稿 | 更新：2026-03-08

---

## 心智模型

Journey 是对一个知识领域的**持续深耕**，不是一次性生成的报告。它的核心价值是把碎片化的材料、个人思考、调研结果，逐渐收敛成一张**真正属于自己的知识地图**。

```
外部材料 (Source)          自己产出
     │                        │
     ▼                        ▼
Source Roadmap          Insight List
（自动生成概览）         （想法、感悟、笔记）
     │                        │
     │    选择性消化            │
     └──────────┬─────────────┘
                ▼
         Journey Roadmap
        （持续演进的认知地图）
                ▲
                │ deep research 结果回写
                │
        Research Todolist
        （具体的待调研问题）
                │
                ▼
          Research Source
         （调研产出的新 source，
           标记 origin: "research"）
```

**所有上下文集中在同一个 Journey** —— source、insight、research todo、journey roadmap 是同一上下文的不同层次，Chat 和 Deep Research 都能感知全局。

---

## 数据模型

```ts
interface Workspace {
  id: string
  title: string
  createdAt: number
  updatedAt: number

  // Journey roadmap（workspace 级，持续演进）
  roadmap: Roadmap | null

  // 子实体
  sources: Source[]
  insights: Insight[]
  researchTodos: ResearchTodo[]
}

interface Source {
  id: string
  type: "text" | "url" | "file"
  origin: "external" | "research"   // external=用户添加，research=调研自动生成
  reference: string
  snapshot: string
  language: string
  roadmap: Roadmap | null           // source 级局部路书
  ingestedAt: number

  // 消化追踪
  digestedSegmentIds: string[]      // 已消化的 segment id 列表
}

interface Roadmap {
  id: string
  markdown: string
  generatedAt: number
}

// 独立的想法/感悟/笔记
interface Insight {
  id: string
  content: string
  // 溯源（可选，不是重点）
  sourceRef?: {
    sourceId: string
    segment?: string               // 来自哪个段落
  }
  createdAt: number
}

// 具体的、待调研的问题
interface ResearchTodo {
  id: string
  topic: string                    // 简短标题，如"LangGraph checkpoint 持久化机制"
  description?: string             // 具体要搞清楚的问题
  status: "pending" | "in-progress" | "done"
  linkedSkillNode?: string         // 关联 journey roadmap 的哪个技能点
  resultSourceId?: string          // 调研完成后自动生成的 source id
  createdAt: number
}
```

---

## 功能一：选择性消化（Source → Journey Roadmap）

### 核心交互

1. 用户在 Source Roadmap 视图中阅读内容
2. 每个 skill node / 段落可勾选（checkbox）
3. 选中后点击「消化进 Journey」
4. 系统将选中内容 + 当前 journey roadmap 发给 LLM，增量合并
5. Journey roadmap 更新，被消化的 segment 标记为 `digestedSegmentIds`

### 增量合并策略

**不重新生成整个 journey roadmap**，而是增量 patch：

```
输入：
  - 当前 journey roadmap（若无则为空）
  - 选中的 segments（结构化 skill nodes 或 markdown 段落）

LLM 任务：
  - 已有节点：合并 subSkills、relatedConcepts，提升 priority（若新 source 标为 high）
  - 新节点：追加到 journey roadmap，归入合适的 category
  - 不改动用户已有的 journey roadmap 其他部分
```

### 消化状态

Source 在左侧列表展示消化进度：
- `●` 未消化（无 digestedSegmentIds）
- `◑` 部分消化（有部分 digestedSegmentIds）
- `○` 全部消化

---

## 功能二：Insight List

### 设计原则

- **独立存在**，不依附于任何 source
- 轻量输入，类似随手记
- 可选填溯源（来自哪个 source 的哪个段落），但不强制
- insight 本身是重点，溯源是辅助

### 交互

- Journey 右侧或底部有一个 insight 输入区，随时可记
- 在阅读 Source Roadmap 时，可以选中一段文字 → 「保存为 Insight」（此时自动填入 sourceRef）
- Insight list 作为 chat 上下文的一部分

---

## 功能三：Research Todolist

### 设计原则

每条 todo 是**具体的、有明确目标的调研任务**，不是模糊的"了解 X"，而是"搞清楚 X 的 Y 机制"。

### 工作流

```
1. 用户在 chat 或阅读时发现知识空白
   → 添加 research todo（手动，或 chat 中 AI 建议）

2. 触发 deep research
   → 系统针对 topic 做深度调研（enhanced Tavily + LLM 综合）
   → 自动生成一个 origin: "research" 的 Source
   → todo 状态变为 done，链接 resultSourceId

3. 用户可选择消化这个 research source 进 journey roadmap
```

### Research Source 与 External Source 的区分

| 字段 | External | Research |
|------|----------|----------|
| `origin` | `"external"` | `"research"` |
| `reference` | 原始链接/文件名 | research todo 的 topic |
| UI 标识 | 无特殊标记 | 🔬 图标 |

---

## 功能四：多 Source 上下文聊天

### Context 注入优先级（预算 60k chars）

```
P1  Journey roadmap（最高密度，always in）       ~8,000 chars
P2  各 source 的 roadmap（已消化优先）           ~6,000 chars/source
P3  Insight list（全量，通常不大）               ~2,000 chars
P4  各 source 原文 snapshot（均分剩余预算）      剩余 / source 数
P5  超出预算的 source                           仅一行摘要
```

### API

```
POST /workspaces/:id/chat/stream
{
  messages: ChatMessage[],
  sourceIds: string[]           // 选中参与上下文的 source，空数组 = 全部
}
```

---

## 实现路线（M3）

### Phase 1：数据模型 + 消化核心
- [ ] workspace 加 `insights[]`、`researchTodos[]` 字段
- [ ] source 加 `origin`、`digestedSegmentIds` 字段
- [ ] `POST /workspaces/:id/digest` API（选中 segments → 增量 patch journey roadmap）
- [ ] Journey roadmap 视图（workspace 主面板 Journey tab）

### Phase 2：Insight + Research Todolist UI
- [ ] Insight 输入 + 列表展示
- [ ] Research todo 增删改状态
- [ ] Deep research 触发 → auto-generate research source

### Phase 3：多 source 上下文 chat
- [ ] `sourceIds[]` 替代单个 sourceId
- [ ] 渐进式 context 加载（含 insights）

### Phase 4：消化 UI 精细化（后期）
- [ ] Source roadmap 段落级 checkbox
- [ ] 消化进度可视化（◑ 部分消化状态）
- [ ] RAG 分块（超长 source 的向量检索）
