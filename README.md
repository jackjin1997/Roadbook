<p align="center">
  <code><b>R O A D B O O K</b></code>
  <br>
  <i>路书 — AI-powered skill roadmap generator</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.9-black?style=flat-square" />
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/D3.js-v7-f9a03c?style=flat-square&logo=d3dotjs" />
  <img src="https://img.shields.io/badge/LangGraph-js-1a1a1a?style=flat-square" />
  <img src="https://img.shields.io/badge/SQLite-WAL-003b57?style=flat-square&logo=sqlite" />
</p>

---

Paste a job description, resume, or any technical concept. **Ariadne** extracts a skill tree, researches every node online, and generates an interactive radial skill graph + structured Markdown roadmap.

```
JD / article / PDF  ──>  Ariadne Engine  ──>  Radial Skill Graph + Markdown Roadbook
                          │
                          ├─ ParseInput
                          ├─ ExtractSkillTree
                          ├─ ResearchNode (Tavily)
                          └─ GenerateRoadbook
```

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
- **Expandable sub-skills** — click a node to reveal satellite sub-skill nodes (dashed lines)
- **Priority = weight** — node size, label weight, charge strength, edge width all scale with priority
- **Smooth transitions** — 250ms eased transitions on hover focus, click highlight, expand/collapse
- **MiroFish interactions** — pink `#E91E63` selection highlight, connected-node focus, floating detail panel
- **Status tracking** — double-click to cycle Not Started → Learning → Mastered

## Features

| Feature | Description |
|---------|-------------|
| **Multi-source Journey** | Upload JDs, articles, PDFs — Ariadne merges them into one unified skill roadmap |
| **Incremental Digest** | Selectively digest source sections into the Journey roadmap |
| **RAG Chat** | Vector-store retrieval-augmented Q&A, responds in your language (zh/en/ja/es/fr) |
| **Research Todo** | AI auto-researches topics online, generates research sources |
| **Graph / Prose** | Toggle between radial force graph and Markdown rendering |
| **Obsidian Export** | One-click `.zip` vault with `[[wikilinks]]` between skill nodes |
| **Skill Radar** | Cross-workspace global skill index with mastery progress |
| **LangSmith Tracing** | Full observability on every generation step |

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
- `ROADBOOK` monospace branding
- Pink `#E91E63` accent on interactions
- Frosted glass floating toolbars
- 10-color category palette

## Changelog

| Version | Date | Highlights |
|---------|------|------------|
| **v0.9** | 2026-03-15 | Radial skill graph, MiroFish UI overhaul, sub-skill expand/collapse, multilingual chat, SSE hardening |
| v0.8 | 2026-03-12 | SQLite data layer (WAL + auto migration) |
| v0.7 | 2026-03-10 | RAG chat retrieval + GitHub Actions CI |
| v0.6 | 2026-03-08 | D3 force graph + Skill Radar + Obsidian export + progress tracking |
| v0.5 | 2026-03-06 | Real-time progress streaming + research reliability |
| v0.4 | 2026-03-04 | Multi-source Journey system |
| v0.1 | 2026-02 | Core workflow, multi-model, CLI |

## License

MIT
