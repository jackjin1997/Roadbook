<p align="center">
  <code><b>R O A D B O O K</b></code>
  <br>
  <i>Your living skill map — it knows what you've learned, what you're forgetting, and how far you are from your next goal.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0-black?style=flat-square" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/D3.js-v7-f9a03c?style=flat-square&logo=d3dotjs" />
  <img src="https://img.shields.io/badge/LangGraph-js-1a1a1a?style=flat-square" />
  <img src="https://img.shields.io/badge/SQLite-WAL-003b57?style=flat-square&logo=sqlite" />
</p>

---

ChatGPT can give you a learning roadmap. **Roadbook gives you a living skill graph** — it remembers your progress, visualizes what you're forgetting, and shows exactly how far you are from your next goal.

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
                    │  POST /skill-match ── JD comparison      │
                    │  GET /skill-events ── timeline data      │
                    │  POST /generate ───── roadbook gen       │
                    │  POST /chat/stream ── RAG chat           │
                    │                                          │
                    │  ┌──────────────────────────────────────┐│
                    │  │ SQLite (WAL)                         ││
                    │  │  workspaces · skill_events            ││
                    │  └──────────────────────────────────────┘│
                    └──────────────────────────────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Living Skill Graph** | Global D3 radial force graph — your entire skill map on the home page |
| **Skill Decay** | Skills fade over time based on `lastActiveAt` — see what you're forgetting |
| **JD Match** | Paste a job description, get a match score with mastered/learning/missing breakdown |
| **Skill Timeline** | Activity feed showing every skill status change across all workspaces |
| **Share Card** | Radar chart skill card with PNG export — your tech fingerprint |
| **Multi-source Journey** | Upload JDs, articles, PDFs — Ariadne merges them into one unified skill roadmap |
| **RAG Chat** | Vector-store retrieval-augmented Q&A, responds in your language (zh/en/ja/es/fr) |
| **Research Todo** | AI auto-researches topics online, generates research sources |
| **Graph / Prose** | Toggle between radial force graph and Markdown rendering |
| **Obsidian Export** | One-click `.zip` vault with `[[wikilinks]]` between skill nodes |
| **LangSmith Tracing** | Full observability on every generation step |

## Radial Skill Graph

Inspired by [MiroFish](https://github.com/666ghj/MiroFish)'s Graph Relationship Visualization — reimagined as an **archery target layout**:

```
          ╭──────── Low ────────╮
        ╭───── Medium ─────╮    │
      ╭──── High ────╮     │    │
      │              │     │    │
      │    ● core    │  ○  │  · │   ←  priority = distance from center
      │    skills    │     │    │
      ╰──────────────╯     │    │
        ╰──────────────────╯    │
          ╰─────────────────────╯
```

- **Radial force layout** — `d3.forceRadial` places High/Medium/Low skills on concentric rings
- **Skill Decay** — node opacity fades from 1.0 to 0.3 over 90 days of inactivity
- **Expandable sub-skills** — click a node to reveal satellite sub-skill nodes
- **Status tracking** — double-click to cycle Not Started → Learning → Mastered
- **MiroFish interactions** — pink `#E91E63` selection highlight, connected-node focus

## Quick Start

```bash
pnpm install
cp .env.example .env   # fill in API keys
pnpm dev               # → http://localhost:1420
```

### Environment Variables

```env
GOOGLE_API_KEY=          # Gemini (default model)
ANTHROPIC_API_KEY=       # Claude (optional)
OPENAI_API_KEY=          # GPT (optional)
TAVILY_API_KEY=          # required — web research
LANGSMITH_API_KEY=       # optional — tracing
```

### CLI

```bash
pnpm ariadne "Node.js 高级后端工程师 JD..."
pnpm ariadne "React, TypeScript" -- --provider anthropic
pnpm ariadne "LangGraph.js" -- --output ./output/langgraph.md
```

## Tech Stack

```
Frontend      React 19 · TypeScript · Tailwind CSS 4
Visualization D3.js (radial force graph) · Mermaid (mindmap)
Agent Engine  LangGraph.js
LLM           Gemini / Claude / GPT (switchable)
Search        Tavily Search API
Database      SQLite (better-sqlite3, WAL mode)
Backend       Express 5 (REST + SSE streaming)
Observability LangSmith (tracing + evaluation)
```

## Design

UI inspired by [MiroFish](https://github.com/666ghj/MiroFish):

- Monochrome palette (`#FAFAFA` / `#1a1a1a`) + dot grid background
- `ROADBOOK` monospace branding (JetBrains Mono)
- Pink `#E91E63` accent on interactions
- Frosted glass floating toolbars
- 10-color category palette

## Changelog

| Version | Date | Highlights |
|---------|------|------------|
| **v1.0** | 2026-03-19 | Living Skill Graph: global skill map home page, skill decay, JD match, skill timeline, share card with radar chart + PNG export |
| v0.9 | 2026-03-15 | Radial skill graph, MiroFish UI overhaul, sub-skill expand/collapse, multilingual chat, SSE hardening |
| v0.8 | 2026-03-12 | SQLite data layer (WAL + auto migration) |
| v0.7 | 2026-03-10 | RAG chat retrieval + GitHub Actions CI |
| v0.6 | 2026-03-08 | D3 force graph + Skill Radar + Obsidian export + progress tracking |
| v0.5 | 2026-03-06 | Real-time progress streaming + research reliability |
| v0.4 | 2026-03-04 | Multi-source Journey system |
| v0.1 | 2026-02 | Core workflow, multi-model, CLI |

## License

MIT
