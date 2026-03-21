# Design TODOs

Design review conducted 2026-03-19. All items from `/plan-design-review` Pass 1-7.

## Priority: High

### ~~1. Create DESIGN.md — Design System Documentation~~ ✅ DONE (2026-03-19)
Completed via `/design-consultation`. DESIGN.md now defines complete "Dopamine Max" dual-mode design system (dark + light) with independent color palettes, typography (Satoshi / Plus Jakarta Sans / JetBrains Mono), spacing, motion, and component specs.

### ~~2. Interaction State Coverage~~ ✅ DONE (2026-03-21)
All empty/loading/error states enhanced: Source List (icon + CTA button), Chat (icon + title + hint + 3 suggestion chips + send spinner), Insights (lightbulb icon + i18n text), Research (search icon + i18n text), SkillRadar (star icon + action button), Workspace loading (spinner). Chat send button shows spinner while loading.

### ~~3. Workspace Visual Hierarchy~~ — Superseded by Design Reskin (2026-03-19)
Original spec (white bg + gray side panels) no longer applies. New DESIGN.md defines glassmorphism panels (dark) and warm cream panels (light). The "main panel leads" hierarchy principle is incorporated into the new design system.

### ~~4. Accessibility (WCAG AA)~~ ✅ DONE (2026-03-21)
Skip nav link in App.tsx, ARIA landmarks (`<nav>`, `<main id="main-content">`, `<aside>`) in Home/Workspace/WorkspaceList/SkillRadar, custom focus ring (Lavender, 2px offset), touch targets 44x44px on coarse pointers, light mode text-muted contrast fixed (#7A6B5A on #FFFBF5 = ~5.2:1), SkillGraph nodes have `aria-label` with name/category/priority/status.

## Priority: Medium

### ~~5. Workspace Card Mini Graph Thumbnails~~ ✅ DONE (2026-03-21)
Emoji + solid gradient headers replaced with deterministic mini-graph SVG thumbnails (hash-seeded node positions, dopamine palette colors, tree edges). Cards with no skills show a muted document icon on a subtle gradient.

### ~~6. Empty Workspace Onboarding~~ ✅ DONE (2026-03-21)
3-step onboarding guide (① Add a source → ② Generate a skill graph → ③ Explore & learn) in EmptyState component. Shows numbered steps with icons when workspace has no sources. Auto-dismisses when first source is added. i18n for all 5 languages.

## Priority: Low

### ~~7. Dark Mode Support~~ — Included in Design Reskin PR (2026-03-19)
Dark mode is now the PRIMARY theme in the new Dopamine Max design system. Implementation includes dual CSS variable sets, ThemeContext with localStorage persistence, and SkillGraph dual-palette support.

## Responsive Design Notes (from Pass 6)

Not a separate TODO — integrate into implementation:
- **Mobile (<768px):** Tab bar switching (already implemented)
- **Tablet (768-1024px):** Dual-panel mode — Main Panel + slide-over side panel (Sources or Chat)
- **Desktop (>1024px):** Three panels side-by-side (current design)

## Priority: Low (Engineering)

### ~~8. Server.ts Route Extraction~~ ✅ DONE (2026-03-21)
Extracted into 6 route files: `routes/workspaces.ts`, `routes/sources.ts`, `routes/chat.ts`, `routes/journey.ts`, `routes/tools.ts`, `routes/helpers.ts` (shared SSE + multer). server.ts reduced to app setup + mount. All 299 tests pass.

## Graph Density Notes (from Pass 7)

When implementing graph improvements:
- **>30 nodes:** Collapse by category into group nodes, click to expand
- Prevents visual noise while preserving information completeness
