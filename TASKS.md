# Tasks

> v0.3 Journey 系统实现计划
> 设计文档：`docs/journey-system-design.md`

---

## Phase 1 — 数据模型 + Journey Roadmap 基础

### T01 · 扩展数据模型 `server.ts`
- [ ] `Workspace` 加 `roadmap: Roadmap | null`、`insights: Insight[]`、`researchTodos: ResearchTodo[]`
- [ ] `Source` 加 `origin: "external" | "research"`、`digestedSegmentIds: string[]`
- [ ] 新增 `Insight` 接口：`{ id, content, sourceRef?, createdAt }`
- [ ] 新增 `ResearchTodo` 接口：`{ id, topic, description?, status, linkedSkillNode?, resultSourceId?, createdAt }`
- [ ] `loadStore` / `saveStore` 兼容旧数据（老 workspace 缺省字段补默认值）

### T02 · Journey Roadmap 生成 API
- [ ] `POST /workspaces/:id/generate-journey` 接受 `{ sourceIds: string[], model?: string }`
- [ ] 并行对各 source 跑 `extractSkillTree`
- [ ] 新增 `mergeSkillTrees` 函数：按 name 去重、priority 取最高、subSkills/relatedConcepts union
- [ ] 合并后走 `researchSkills → generateRoadbook`
- [ ] 结果写入 `workspace.roadmap`，返回 `{ roadmap, workspaceTitle }`

### T03 · 消化 API
- [ ] `POST /workspaces/:id/digest` 接受 `{ sourceId, segmentIds: string[], segments: string[] }`
- [ ] 将选中 segments + 当前 `workspace.roadmap` 发给 LLM，增量 patch（不重新生成全量）
- [ ] LLM prompt：已有节点合并、新节点追加、不改动其他部分
- [ ] 更新 `source.digestedSegmentIds`，写回 workspace

### T04 · Insight API
- [ ] `POST /workspaces/:id/insights` 新建 insight `{ content, sourceRef? }`
- [ ] `DELETE /workspaces/:id/insights/:insightId`
- [ ] `GET /workspaces/:id` 已包含 insights（无需单独接口）

### T05 · Research Todo API
- [ ] `POST /workspaces/:id/research-todos` 新建 todo `{ topic, description?, linkedSkillNode? }`
- [ ] `PATCH /workspaces/:id/research-todos/:todoId` 更新 status
- [ ] `DELETE /workspaces/:id/research-todos/:todoId`
- [ ] `POST /workspaces/:id/research-todos/:todoId/run` 触发 deep research → 生成 `origin: "research"` 的 source → 更新 todo `resultSourceId`

---

## Phase 2 — 前端 Journey Tab + 消化 UI

### T06 · 前端 types 同步
- [ ] `src/types.ts` 加 `Insight`、`ResearchTodo` 类型
- [ ] `Source` 加 `origin`、`digestedSegmentIds`
- [ ] `Workspace` 加 `roadmap`、`insights`、`researchTodos`

### T07 · api.ts 新增接口
- [ ] `generateJourney(workspaceId, sourceIds, model?)`
- [ ] `digestSource(workspaceId, sourceId, segmentIds, segments)`
- [ ] `addInsight(workspaceId, content, sourceRef?)`
- [ ] `deleteInsight(workspaceId, insightId)`
- [ ] `addResearchTodo(workspaceId, topic, description?)`
- [ ] `updateResearchTodo(workspaceId, todoId, status)`
- [ ] `deleteResearchTodo(workspaceId, todoId)`
- [ ] `runResearchTodo(workspaceId, todoId)`

### T08 · Workspace 主面板 Journey Tab
- [ ] 主面板顶部加 tab 切换：`Journey` | `Source`
- [ ] Journey tab：展示 `workspace.roadmap`（Markdown 渲染）
- [ ] Journey tab 无 roadmap 时：引导生成（选 source + 「生成 Journey Roadmap」按钮）
- [ ] Source 列表支持多选（checkbox，hover 显示）
- [ ] 选中 ≥1 source 时底部出现「生成 Journey Roadmap」

### T09 · Source 消化 UI
- [ ] Source roadmap 视图中，每个 skill node 卡片加 checkbox
- [ ] 选中节点后出现「消化进 Journey」按钮
- [ ] 消化中 loading 状态
- [ ] Source 列表项展示消化状态图标：● 未消化 / ◑ 部分 / ○ 全部

### T10 · Insight Panel
- [ ] Chat 侧边或 Journey tab 内加 Insight 区域
- [ ] 输入框 + 提交（Enter）
- [ ] Insight 列表展示（含可选的 sourceRef badge）
- [ ] 删除

### T11 · Research Todo Panel
- [ ] Todo 列表：展示 topic、status、linked skill node
- [ ] 新增 todo 输入
- [ ] 「Run」按钮触发 deep research，loading 状态
- [ ] 完成后展示生成的 research source 链接
- [ ] Research source 在 source 列表用 🔬 区分

---

## Phase 3 — 多 Source 上下文 Chat

### T12 · Chat 多 source 上下文
- [ ] `chat/stream` 接口接受 `sourceIds: string[]`（空数组 = 全部 source）
- [ ] `buildMultiSourceContext` 函数（见 `journey-system-design.md` 伪代码）
- [ ] Insight list 注入 context（P3 优先级）
- [ ] UI：chat 面板顶部展示当前上下文来源

---

## Phase 4 — 打磨

### T13 · 消化粒度细化
- [ ] Source roadmap markdown 按段落拆分，每段有独立 id
- [ ] 段落级 checkbox（当前是 node 级）
- [ ] 已消化段落高亮/置灰

### T14 · RAG 分块（后期）
- [ ] Source 摄入时分块存储
- [ ] `MemoryVectorStore` 集成
- [ ] Chat 时 embed query → top-k chunks 替代全文

---

## 当前进度

- [x] v0.2 全部功能（workspace、source、chat SSE、文件摄入）
- [x] 模型调度修复（proxy 路由、Anthropic BASE_URL）
- [x] Journey 系统设计文档
- [x] T01 · 数据模型扩展
- [x] T02 · Journey Roadmap 生成 API
- [x] T03 · 消化 API
- [x] T04 · Insight API
- [x] T05 · Research Todo API
- [x] T06 · 前端 types 同步
- [x] T07 · api.ts 新接口
- [x] T08 · Journey Tab + 多选 source + Generate Journey
- [x] T09 · 消化 UI（markdown 分段 checkbox，已消化高亮/置灰）
- [x] T10 · Insight Panel
- [x] T11 · Research Todo Panel（Run → 🔬 source）
- [ ] T12 → 多 source 上下文 chat
