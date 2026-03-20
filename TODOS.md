# Design TODOs

Design review conducted 2026-03-19. All items from `/plan-design-review` Pass 1-7.

## Priority: High

### ~~1. Create DESIGN.md — Design System Documentation~~ ✅ DONE (2026-03-19)
Completed via `/design-consultation`. DESIGN.md now defines complete "Dopamine Max" dual-mode design system (dark + light) with independent color palettes, typography (Satoshi / Plus Jakarta Sans / JetBrains Mono), spacing, motion, and component specs.

### 2. Interaction State Coverage
**What:** Add empty/loading/error states for all components per this spec:
- **Source List empty:** "Paste a URL, text, or upload a file to start" + Add Source button centered
- **Chat empty (no messages):** "Ask anything about your sources" + 3 example question chips
- **Chat empty (no context):** "Select sources to give me context" + arrow pointing left
- **Insights empty:** "Insights will appear as you explore" + muted icon
- **Research empty:** "Add research topics to investigate" + input focus
- **Journey empty:** "Select sources and generate a journey" + progress preview
- **File upload error:** Red toast + file type/size limit hint
- **Skill Radar empty:** "Generate roadbooks to build your skill radar" + back to Home button
- **Chat sending:** Input disabled + send button → spinner
- **Source list loading:** Skeleton cards
**Why:** Users in non-happy-path states don't know what happened or what to do next.
**Pros:** Every state becomes intentional; reduces user confusion and support questions.
**Cons:** ~10 components to update.
**Context:** Some states exist (Workspace list loading/empty/error) but most are bare "No items" text.
**Depends on:** Nothing.

### ~~3. Workspace Visual Hierarchy~~ — Superseded by Design Reskin (2026-03-19)
Original spec (white bg + gray side panels) no longer applies. New DESIGN.md defines glassmorphism panels (dark) and warm cream panels (light). The "main panel leads" hierarchy principle is incorporated into the new design system.

### 4. Accessibility (WCAG AA)
**What:**
- Skip navigation link (hidden, visible on focus)
- ARIA landmarks: `<nav>` header, `<main>` main panel, `<aside>` sources/chat
- Custom focus ring: `2px solid #E91E63, 2px offset` (replace browser default)
- Touch targets: minimum 44×44px (current: some buttons 32px)
- Fix muted text contrast: `#888` → `#666` on `#FAFAFA` background (3.5:1 → 5.7:1)
- Graph nodes: `aria-label` with skill name + status + priority
**Why:** Accessibility is not optional. Current implementation relies entirely on browser defaults.
**Pros:** WCAG AA compliance; usable by keyboard-only and screen reader users.
**Cons:** Requires touching most components; graph a11y is non-trivial.
**Context:** Color contrast issue: `--color-text-muted: #888` on `--color-bg: #FAFAFA` = 3.5:1 (fails WCAG AA 4.5:1).
**Depends on:** DESIGN.md (for token updates).

## Priority: Medium

### 5. Workspace Card Mini Graph Thumbnails
**What:** Replace emoji gradient card headers with small static SVG thumbnails of the workspace's skill graph (top 5-8 high-priority nodes). Each card becomes visually unique.
**Why:** Current emoji + gradient cards look like generic SaaS templates (AI Slop risk). Mini graphs reinforce product identity.
**Pros:** Every card is visually distinct; product personality carries through to Home page.
**Cons:** Requires mini D3 renderer or SVG snapshot; performance consideration for many workspaces.
**Context:** Hash-based 8-color gradient palette currently used. MiroFish aesthetic should extend to Home.
**Depends on:** Nothing, but benefits from DESIGN.md for consistent node colors.

### 6. Empty Workspace Onboarding
**What:** When a workspace has no sources, Main Panel shows centered 3-step guide:
① Add a source → ② Generate graph → ③ Explore & learn.
Auto-dismisses when first source is added.
**Why:** New users face blank three-panel layout after creating workspace — no indication of where to start.
**Pros:** Reduces time-to-value; smoother emotional journey from curiosity → first success.
**Cons:** Minimal — conditional render + copy.
**Context:** Hero animation on Home works well for landing; this fills the gap for workspace entry.
**Depends on:** Interaction state coverage (#2) for consistent empty state patterns.

## Priority: Low

### ~~7. Dark Mode Support~~ — Included in Design Reskin PR (2026-03-19)
Dark mode is now the PRIMARY theme in the new Dopamine Max design system. Implementation includes dual CSS variable sets, ThemeContext with localStorage persistence, and SkillGraph dual-palette support.

## Responsive Design Notes (from Pass 6)

Not a separate TODO — integrate into implementation:
- **Mobile (<768px):** Tab bar switching (already implemented)
- **Tablet (768-1024px):** Dual-panel mode — Main Panel + slide-over side panel (Sources or Chat)
- **Desktop (>1024px):** Three panels side-by-side (current design)

## Priority: Low (Engineering)

### 8. Server.ts Route Extraction
**What:** Refactor server.ts by splitting existing routes into `routes/workspaces.ts`, `routes/sources.ts`, `routes/chat.ts`.
**Why:** server.ts is 600+ lines with all API endpoints in one file — beyond single-file reasonable size. New skill endpoints (from Living Skill Graph) already go into `routes/skills.ts`, but existing routes remain monolithic.
**Pros:** Better code organization, easier to navigate, clearer ownership per domain.
**Cons:** Moderate diff touching many imports; risk of breaking existing tests if not careful.
**Context:** Decision made during Eng Review 2026-03-19 to only extract new routes (`routes/skills.ts`) and defer existing route extraction. This TODO captures the deferred work.
**Effort:** S (CC: ~20min)
**Priority:** P3
**Depends on:** Living Skill Graph Milestone 1 completion (new route pattern established first).

## Graph Density Notes (from Pass 7)

When implementing graph improvements:
- **>30 nodes:** Collapse by category into group nodes, click to expand
- Prevents visual noise while preserving information completeness
