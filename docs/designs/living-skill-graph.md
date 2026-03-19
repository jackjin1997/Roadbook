# Living Skill Graph — Roadbook 战略重定位

> **Status:** COMPLETED | **Date:** 2026-03-19 | **Mode:** Selective Expansion
> **Branch:** main | **Repo:** jackjin1997/Roadbook

---

## 一句话定位

> ChatGPT 能给你一份学习路线图。Roadbook 给你一张活的技能地图——
> 它知道你学了什么、忘了什么、离下一个目标还有多远。

## 产品转型

| | Before | After |
|---|--------|-------|
| **定位** | 路书生成器 | 活的技能图谱 |
| **核心动作** | 粘贴 JD → 生成路书 | 维护一张持续更新的技能地图 |
| **首页** | Workspace 卡片列表 | 全局技能图谱（D3 radial graph） |
| **护城河** | 无（ChatGPT 可替代） | 状态 + 衰减 + 差距分析 + 成长记录 |

## 核心差异化 (vs ChatGPT/Claude)

1. **State** — ChatGPT 生成一个列表然后忘记。Roadbook 记住你的进度。
2. **Decay** — 技能会随时间退化。Roadbook 可视化你正在遗忘什么。
3. **Gap Analysis** — 粘贴 JD，看到你的匹配 %。不是新路书——是比较。
4. **Growth History** — 技能变化时间线。学习的证明。
5. **Identity** — 可分享的技能雷达图。你的技术指纹。

## 实现路径：渐进演化 (Approach A)

保留现有路书生成能力，在其之上逐步构建「活图谱」层。
每个 milestone 都能独立发布。风险低，复用多。

## Milestone 计划

### Milestone 1: Foundation — 技能图谱基础

| Feature | Description | Effort | Reuses |
|---------|-------------|--------|--------|
| 首页重设计 | SkillRadar → D3 radial graph 全局图谱首页 | M | SkillGraph.tsx, /skill-index API |
| Skill Decay | `lastActiveAt` 字段 + 节点 opacity 衰减 | S | SkillGraph.tsx 渲染逻辑 |
| 学习日志数据模型 | `skill_events` SQLite 表，记录状态变化 | S | store.ts 迁移模式 |

**数据模型变更：**
```typescript
// skillProgress 从 Record<string, SkillStatus> 演化为：
interface SkillProgressEntry {
  status: SkillStatus;              // "not_started" | "learning" | "mastered"
  lastActiveAt: number;             // 最后交互时间戳
  firstSeenAt: number;              // 首次出现时间戳
}

// 新增：技能事件日志
interface SkillEvent {
  id: string;
  skillName: string;
  fromStatus: SkillStatus | null;   // null = 首次出现
  toStatus: SkillStatus;
  source: "manual" | "generation" | "chat";
  timestamp: number;
  workspaceId?: string;
}
```

**迁移策略：** 旧 `Record<string, SkillStatus>` → 自动转换：
```typescript
// "React": "learning" → "React": { status: "learning", lastActiveAt: ws.updatedAt, firstSeenAt: ws.createdAt }
```

### Milestone 2: Intelligence — 智能分析

| Feature | Description | Effort | Reuses |
|---------|-------------|--------|--------|
| JD 匹配度评分 | 粘贴 JD → 技能提取 → 与图谱比对 → 匹配报告 | M | extractSkillTree, mergeSkillTrees |
| 技能时间线 UI | Activity timeline 展示成长轨迹 | S | skill_events 数据 |

**JD 匹配流程：**
```
用户粘贴 JD
    ↓
extractSkillTree(JD) → target skills
    ↓
loadGlobalSkillMap() → user skills + status
    ↓
compare(target, user) → {
  matched: [{ skill: "React", status: "mastered" }],     // ✅
  learning: [{ skill: "GraphQL", status: "learning" }],  // ⚠️
  missing:  [{ skill: "K8s", status: null }],             // ❌
  score: 72                                                // 百分比
}
    ↓
渲染匹配报告 UI
```

### Milestone 3: Identity — 对外展示

| Feature | Description | Effort | Reuses |
|---------|-------------|--------|--------|
| 技能分享卡片 | SVG/PNG 雷达图生成 + 下载/分享 | M | D3 radial chart |
| 白皮书 / README | 重写产品叙事，新定位 | S | — |

**分享卡片：**
```
┌─────────────────────────────┐
│     ROADBOOK SKILL RADAR    │
│                             │
│         Frontend            │
│        ╱    ╲              │
│   DevOps ── Backend         │
│        ╲    ╱              │
│          AI                 │
│                             │
│  ● 12 skills mastered       │
│  ○ 5 skills learning        │
│  · 3 skills planned         │
│                             │
│  roadbook.dev/@username     │
└─────────────────────────────┘
```

## 实施顺序

```
Week 1: Milestone 1 — Foundation
  ├── Data model: skillProgress 迁移 + skill_events 表
  ├── Home page: workspace list → global skill graph
  ├── Skill Decay: opacity 渲染 (lastActiveAt)
  └── Event logging: 自动记录状态变化

Week 2: Milestone 2 — Intelligence
  ├── POST /skill-match: JD → 匹配报告 API
  ├── Match Report UI: ✅/⚠️/❌ + 百分比
  ├── Timeline UI: 垂直 activity feed
  └── White paper draft

Week 3: Milestone 3 — Identity
  ├── Radar chart SVG 生成
  ├── Share card: download PNG + copy link
  └── README 重写, Polish, Tests
```

## 目标用户画像

| Persona | Pain Point | Roadbook 价值 |
|---------|-----------|---------------|
| **求职者** | "我离这个岗位还差什么？" | JD 匹配度 → 精确差距 → 定向学习 |
| **自学者** | "我学了很多，但没有系统感" | 技能图谱 → 可视化进度 → 成就感 |
| **技术面试官** | "候选人技能怎么对比？" | 分享卡片 → 标准化技能展示 |
| **技术写手/博主** | "怎么展示我的技术栈？" | 雷达图 → 社交分享 → 个人品牌 |

## 技术架构（变更后）

```
                    ┌──────────────────────────────────────────┐
                    │              Frontend                     │
                    │                                          │
                    │  ┌────────────┐  ┌────────────────────┐  │
                    │  │ SkillMap   │  │ Workspace          │  │
   User ──────────▶│  │ (Home)     │  │ (Source+Graph+Chat) │  │
                    │  │            │  │                    │  │
                    │  │ Global D3  │  │ Per-source D3      │  │
                    │  │ radial     │  │ radial + prose     │  │
                    │  └──────┬─────┘  └────────┬───────────┘  │
                    │         │                 │              │
                    │  ┌──────▼─────┐  ┌────────▼───────────┐  │
                    │  │ JD Match   │  │ Share Card         │  │
                    │  │ Report     │  │ Generator          │  │
                    │  └──────┬─────┘  └────────┬───────────┘  │
                    └─────────┼─────────────────┼──────────────┘
                              │                 │
                    ┌─────────▼─────────────────▼──────────────┐
                    │              Backend (Ariadne)            │
                    │                                          │
                    │  GET /skill-index ─── global skill map   │
                    │  POST /skill-match ── JD comparison      │ ← NEW
                    │  GET /skill-events ── timeline data      │ ← NEW
                    │  POST /generate ───── roadbook gen       │
                    │  POST /chat/stream ── RAG chat           │
                    │                                          │
                    │  ┌──────────────────────────────────────┐│
                    │  │ SQLite (WAL)                         ││
                    │  │  workspaces    ← existing             ││
                    │  │  skill_events  ← NEW                  ││
                    │  └──────────────────────────────────────┘│
                    └──────────────────────────────────────────┘
```

## 可复用的现有代码

| 现有模块 | 复用方式 |
|---------|---------|
| `extractSkillTree` | JD 匹配度：提取目标 JD 的技能树 |
| `mergeSkillTrees` | 全局图谱：跨 workspace 合并技能 |
| `SkillGraph.tsx` | 首页全局图谱：同一个 D3 radial 组件 |
| `/skill-index` API | 首页数据源：已有跨 workspace 聚合 |
| `store.ts` 迁移模式 | skill_events 表：复用 JSON→SQLite 迁移 |
| `SkillRadar.tsx` | 分享卡片：可用于 SVG 基础 |

---

## 工程实施方案（Eng Review 2026-03-19）

### 架构决策

| # | 决策 | 结论 |
|---|------|------|
| 1 | skill_events 存储方式 | **独立 SQLite 表**（非 workspace JSON blob），支持跨 workspace 查询 |
| 2 | 新端点代码组织 | **新文件** `src/ariadne/routes/skills.ts`，不动 server.ts 现有代码 |
| 3 | JD match 性能 | **内存缓存** `hash(JD text) → Map<hash, SkillNode[]>`，避免重复 LLM 调用 |

### 文件变更清单

```
Milestone 1: Foundation (~5 files)
──────────────────────────────────
  MODIFY  src/ariadne/types.ts
          + SkillProgressEntry { status, lastActiveAt, firstSeenAt }
          + SkillEvent { id, skillName, fromStatus, toStatus, source, timestamp, workspaceId }
          ~ Workspace.skillProgress: Record<string, SkillStatus> → Record<string, SkillStatus | SkillProgressEntry>

  MODIFY  src/ariadne/store.ts
          + CREATE TABLE skill_events (...)
          + insertSkillEvent(event)
          + getSkillEvents(filters)
          + deleteSkillEventsByWorkspace(wsId)
          ~ migrateWorkspace(): convert old skillProgress string values → SkillProgressEntry

  MODIFY  src/ariadne/server.ts
          + app.use("/", skillRoutes)  // 一行引入
          ~ PATCH /skill-progress: emit SkillEvent + update lastActiveAt
          ~ DELETE /workspaces/:id: cascade delete skill_events

  CREATE  src/ariadne/routes/skills.ts
          + GET  /skill-events?limit=50&skillName=React
          + GET  /skill-index (move from server.ts, enrich with lastActiveAt)

  MODIFY  src/pages/Home.tsx
          - Workspace card grid
          + Global D3 radial skill graph (reuse SkillGraph.tsx)
          + Skill decay opacity rendering
          + Workspace navigation via node click
          + Empty/loading/error states

Milestone 2: Intelligence (~4 files)
─────────────────────────────────────
  MODIFY  src/ariadne/routes/skills.ts
          + POST /skill-match { text } → { matched, learning, missing, score }
          + In-memory cache: hash(text) → SkillNode[]

  CREATE  src/pages/JDMatch.tsx
          + JD input textarea
          + Loading state (LLM call 5-10s)
          + Match report: ✅ mastered / ⚠️ learning / ❌ missing
          + Score percentage + radial progress

  CREATE  src/pages/SkillTimeline.tsx
          + Vertical activity feed
          + Filter by skill name
          + Empty state

  MODIFY  src/api.ts
          + postSkillMatch(text)
          + getSkillEvents(filters)

Milestone 3: Identity (~3 files)
────────────────────────────────
  CREATE  src/pages/ShareCard.tsx
          + D3 radar chart (category axes)
          + Skill count badges (mastered / learning / planned)
          + Export: SVG → Canvas → PNG blob → download

  MODIFY  README.md
          - "路书生成器" narrative
          + "活的技能图谱" narrative
          + Updated feature table + architecture diagram

  MODIFY  src/i18n.ts
          + ~20 new keys (match report, timeline, share card labels)
```

### 数据模型详细设计

```sql
-- skill_events 表 (Milestone 1)
CREATE TABLE IF NOT EXISTS skill_events (
  id            TEXT PRIMARY KEY,
  skill_name    TEXT NOT NULL,
  from_status   TEXT,              -- null = first appearance
  to_status     TEXT NOT NULL,
  source        TEXT NOT NULL,     -- "manual" | "generation" | "chat"
  timestamp     INTEGER NOT NULL,
  workspace_id  TEXT,              -- nullable (global events)
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_events_timestamp ON skill_events(timestamp DESC);
CREATE INDEX idx_events_skill ON skill_events(skill_name);
```

```typescript
// skillProgress 迁移 — 兼容旧格式
function migrateSkillProgress(
  raw: Record<string, string | SkillProgressEntry>,
  fallbackTimestamp: number,
): Record<string, SkillProgressEntry> {
  const result: Record<string, SkillProgressEntry> = {};
  for (const [name, val] of Object.entries(raw)) {
    if (typeof val === "string") {
      // Old format: "mastered" → migrate
      result[name] = {
        status: val as SkillStatus,
        lastActiveAt: fallbackTimestamp,
        firstSeenAt: fallbackTimestamp,
      };
    } else {
      result[name] = val;
    }
  }
  return result;
}
```

### Skill Decay 计算

```typescript
// Decay opacity: 1.0 → 0.3 over 90 days
function decayOpacity(lastActiveAt: number, now: number = Date.now()): number {
  const DECAY_DAYS = 90;
  const daysSince = (now - lastActiveAt) / (1000 * 60 * 60 * 24);
  const decay = Math.max(0.3, 1.0 - (daysSince / DECAY_DAYS) * 0.7);
  return decay;
}
```

### JD Match 比较算法

```typescript
// Normalize skill names for fuzzy matching
function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.js$/i, "")
    .replace(/\.ts$/i, "")
    .replace(/\s+/g, "")
    .replace(/kubernetes/i, "k8s")
    .trim();
}

// Compare extracted JD skills against user's global skill map
function compareSkills(
  targetSkills: SkillNode[],
  userSkills: Map<string, SkillProgressEntry>,
): MatchResult {
  const matched: MatchedSkill[] = [];
  const learning: MatchedSkill[] = [];
  const missing: MatchedSkill[] = [];

  for (const target of targetSkills) {
    const normalized = normalizeSkillName(target.name);
    // Try exact then fuzzy match
    const userEntry = [...userSkills.entries()].find(
      ([name]) => normalizeSkillName(name) === normalized
    );

    if (userEntry) {
      const [name, entry] = userEntry;
      const item = { skill: name, priority: target.priority };
      if (entry.status === "mastered") matched.push(item);
      else if (entry.status === "learning") learning.push(item);
      else missing.push(item);
    } else {
      missing.push({ skill: target.name, priority: target.priority });
    }
  }

  const total = matched.length + learning.length + missing.length;
  const score = total > 0
    ? Math.round(((matched.length + learning.length * 0.5) / total) * 100)
    : 0;

  return { matched, learning, missing, score };
}
```

### 首页路由变更

```typescript
// App.tsx routing changes
<Route path="/" element={<SkillMap />} />           // NEW: global skill graph
<Route path="/workspaces" element={<Home />} />     // OLD home moved here
<Route path="/workspace/:id" element={<Workspace />} />
<Route path="/match" element={<JDMatch />} />       // NEW
<Route path="/timeline" element={<SkillTimeline />} /> // NEW
<Route path="/share" element={<ShareCard />} />     // NEW
// /skills route removed (merged into /)
```

### 测试计划摘要

| Codepath | 测试类型 | 关键场景 |
|----------|---------|---------|
| skillProgress 迁移 | Unit | 旧格式 → 新格式，幂等性 |
| skill_events CRUD | Unit | 插入、查询、级联删除 |
| PATCH /skill-progress | Integration | 状态变化 → 事件记录 |
| POST /skill-match | Integration | 全匹配、部分匹配、零匹配、空输入、LLM 超时 |
| normalizeSkillName | Unit | 大小写、.js 后缀、别名 |
| decayOpacity | Unit | 0 天 → 1.0，45 天 → 0.65，90 天 → 0.3，180 天 → 0.3 |
| 首页图谱 | Component | 有技能、无技能、加载中 |

### 失败模式及应对

| 失败场景 | 应对方式 |
|---------|---------|
| skillProgress 旧格式数据 | migrateSkillProgress 自动转换 |
| skill_events 写入失败 | catch + console.error，不阻断主流程 |
| JD match LLM 超时 | 30s timeout + 用户提示 "分析超时，请重试" |
| JD match 提取空技能树 | 返回 `{ score: 0, missing: [] }` + 提示 "未识别到技能" |
| Decay lastActiveAt = 0 | decayOpacity 兜底返回 0.3 (不会隐形) |
| Canvas API 不可用 | 降级为 SVG 下载，不做 PNG 转换 |
