# Design System — Roadbook

## Product Context
- **What this is:** Living skill graph — upload JDs, articles, PDFs, get a unified skill roadmap with decay tracking, JD matching, and share cards
- **Who it's for:** Developers and professionals tracking skill growth across knowledge domains
- **Space/industry:** Developer tools / learning / skill tracking
- **Project type:** Web app (React 19 + D3.js + LangGraph backend)
- **Core metaphor:** "Lighting up your knowledge map" — each workspace is an uncharted territory, skills glow brighter as you master them, the graph fills with color as you grow

## Aesthetic Direction
- **Direction:** Dopamine Max — deep dark canvas where high-saturation colors explode like neon. Light mode companion with warm white canvas and the same vibrant palette.
- **Decoration level:** Expressive — ambient glow blobs, glassmorphism cards, node glow effects, particle bursts on unlock. Decoration is tied to function (glow = mastery, pulse = learning, particles = state change).
- **Mood:** Rewarding, energetic, visually addictive. Every interaction gives dopamine feedback. Like a game achievement system meets premium developer tool.
- **Reference sites:** Apple Fitness achievements, Honkai: Star Rail UI, Figma gradient interfaces

## Typography
- **Display/Hero:** Satoshi (Black 900, Bold 700) — geometric with warmth, pairs well with rounded iOS aesthetic. Load from Fontshare.
- **Body/UI:** Plus Jakarta Sans (400–700) — rounder and friendlier than Inter, optimized for screen reading. Load from Google Fonts.
- **Mono/Data/Brand:** JetBrains Mono (400–700) — brand DNA, used for logo, data tables, code, labels. Load from Google Fonts.
- **Scale:**
  - Hero: clamp(48px, 7vw, 76px) / 900 / -0.035em
  - H1: 28px / 700 / -0.02em
  - H2: 18px / 700 / -0.02em
  - Body: 15px / 400 / normal
  - Small: 13px / 500
  - Caption: 11px / 600 / 0.12em uppercase (mono)
  - Data: 13px mono

## Color

### Dark Mode (primary)
- **Background:** #0A0A12 (deep purple-black)
- **Surface:** rgba(255,255,255,0.05) with backdrop-filter: saturate(180%) blur(20px)
- **Surface hover:** rgba(255,255,255,0.08)
- **Surface strong:** rgba(255,255,255,0.10)
- **Border:** rgba(255,255,255,0.08)
- **Border light:** rgba(255,255,255,0.12)
- **Text:** #F0F0F5
- **Text muted:** #9090A8
- **Text dim:** #5A5A72

### Light Mode
- **Background:** #FFFBF5 (warm cream — NOT cold white)
- **Surface:** rgba(255,255,255,0.9) with backdrop-filter, box-shadow: 0 2px 12px rgba(200,140,80,0.06)
- **Surface hover:** #FFF5E8
- **Border:** rgba(200,160,100,0.15) (warm brown tint — NOT cold gray)
- **Border light:** rgba(200,160,100,0.2)
- **Text:** #2D2016 (warm dark brown)
- **Text muted:** #9E8B76
- **Text dim:** #C4B5A3

### Dopamine Palette — Dark Mode (neon, high-saturation)
| Name | Hex | Usage | Glow |
|------|-----|-------|------|
| Cherry | #FF6B6B | Learning status, errors | rgba(255,107,107,0.5) |
| Teal | #4ECDC4 | Backend category | rgba(78,205,196,0.5) |
| Gold | #FFE66D | Achievements, warnings | rgba(255,230,109,0.5) |
| Lavender | #A78BFA | AI/ML category | rgba(167,139,250,0.5) |
| Hot Pink | #FF9FF3 | Design/creative category | rgba(255,159,243,0.5) |
| Electric | #6C5CE7 | Systems category, primary gradients | rgba(108,92,231,0.5) |
| Sky | #74B9FF | Frontend category | rgba(116,185,255,0.5) |
| Lime | #55EFC4 | Mastered status, success | rgba(85,239,196,0.5) |
| Coral | #FF7675 | Decay alerts | rgba(255,118,117,0.5) |
| Peach | #FFEAA7 | Highlights | rgba(255,234,167,0.5) |

### Dopamine Palette — Light Mode (warm, softer, pastel-leaning)
The same neon palette looks harsh on warm cream backgrounds. Light mode uses a dedicated warmer variant:

| Name | Dark Hex | Light Hex | Shift |
|------|----------|-----------|-------|
| Cherry | #FF6B6B | #FF8A80 | softer coral |
| Teal | #4ECDC4 | #5CD6C8 | warmer mint |
| Gold | #FFE66D | #FFD54F | warm gold |
| Lavender | #A78BFA | #B39DDB | softer wisteria |
| Hot Pink | #FF9FF3 | #F8BBD0 | peach pink |
| Electric | #6C5CE7 | #9575CD | softer purple |
| Sky | #74B9FF | #81D4FA | warm sky |
| Lime | #55EFC4 | #69F0AE | warm mint green |
| Coral | #FF7675 | #FFAB91 | peach |
| Peach | #FFEAA7 | #FFE0B2 | warm cream |

### Semantic Colors
- **Dark mode:** Success #55EFC4, Warning #FFE66D, Error #FF6B6B, Info #74B9FF
- **Light mode:** Success #69F0AE, Warning #FFD54F, Error #FF8A80, Info #81D4FA

### Category → Color Mapping
Each skill category gets a dedicated dopamine color. The graph becomes a colorful map where you can identify domains at a glance. Use the dark or light variant depending on the active theme.

### Gradient Patterns
- **Dark mode CTA:** linear-gradient(135deg, Electric, Hot Pink)
- **Light mode CTA:** linear-gradient(135deg, Coral, Hot Pink)
- **Hero text:** linear-gradient(135deg, Cherry, Hot Pink, Lavender, Sky) with animation
- **Progress bars:** linear-gradient(90deg, Teal, Lime)
- **Ambient blobs (dark):** Electric and Hot Pink, blur(120px), opacity 0.15
- **Ambient blobs (light):** Peach/Gold (#FFCC80) and Hot Pink, blur(120px), opacity 0.12–0.15

### Light Mode Adaptations
- **Warm cream base** #FFFBF5, all borders/shadows use warm brown tones (rgba(200,160,100,...)) — NEVER cold gray
- **Independent warmer color palette** — not the same hex values as dark mode
- **All colored nodes have white border** (2px solid rgba(255,255,255,0.7)) + white halo ring (box-shadow: 0 0 0 3px rgba(255,255,255,0.5))
- **All colored nodes/buttons use white text** — never dark text on bright colors (except Gold uses dark brown #6B4E00)
- Tags use 12% opacity warm tint backgrounds with matching text
- **Pending/unstarted nodes:** warm beige #FFF3E8 with dashed brown border #E8D5C0 — NEVER dark gray
- **Graph background:** warm gradient (cream → pale pink → pale lavender), not flat white
- **NO black shadows anywhere** — all depth via colored shadows or white halos only
- Ambient gradient blobs at 12–15% opacity, peach/golden tones
- Glass cards use rgba(255,255,255,0.7) + blur with warm-toned borders
- No `inset box-shadow` with black rgba — all depth via colored shadows or white halos only

## Spacing
- **Base unit:** 4px
- **Density:** Spacious (iOS-level breathing room)
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined (strict grid for panels/lists, free layout only for force-directed graph)
- **Grid:** 12 columns, 24px gutter
- **Max content width:** 1080px
- **Border radius:** sm:8px, md:12px, lg:16px, xl:20px, 2xl:24px, full:9999px
- **Cards:** Glassmorphism — semi-transparent background + backdrop-filter: saturate(180%) blur(20px) + 1px border
- **Shadows (light mode):** sm: 0 1px 3px rgba(0,0,0,0.04), md: 0 4px 12px rgba(0,0,0,0.06), lg: 0 8px 30px rgba(0,0,0,0.08)

### Responsive Breakpoints
- **Mobile (<768px):** Single column. Workspace uses tab bar to switch between panels (Sources/Main/Chat). Header nav collapses to hamburger or icon-only buttons. Graph fills full width. Touch targets minimum 44×44px.
- **Tablet (768–1024px):** Dual-panel mode. Workspace shows Main + one side panel at a time (slide-over). Home graph fills full width with sidebar stats below.
- **Desktop (>1024px):** Full three-panel workspace layout. Home shows graph + sidebar stats.

## Accessibility
- **Focus ring:** 2px solid Lavender #A78BFA (dark) / #9575CD (light), 2px offset. Replaces old #E91E63 pink.
- **Touch targets:** Minimum 44×44px on all interactive elements.
- **Contrast caution:** The following color + background combinations need special attention during implementation:
  - Gold #FFE66D text on dark background — use dark brown text (#6B4E00) instead of white
  - Gold #FFD54F on light cream — use dark brown text, never white
  - Lime #55EFC4 with white text on dark — passes, but verify
  - text-dim colors (#5A5A72 dark, #C4B5A3 light) — verify ≥4.5:1 against background
- **Graph nodes:** All nodes must have `aria-label` with skill name + status + category.
- **Theme toggle:** Must be keyboard accessible, labeled "Switch to light/dark mode".

## Motion
- **Approach:** Expressive — every animation has functional meaning + dopamine feedback
- **Easing:** Spring cubic-bezier(0.175, 0.885, 0.32, 1.275) for interactions; ease-in-out for ambient
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)

### Node Animations
| Animation | When | Effect |
|-----------|------|--------|
| Learning Pulse | Skill status = learning | Glow intensity oscillates 2s cycle |
| Mastered Breathe | Skill status = mastered | Gentle opacity oscillation 3s cycle |
| Unlock Burst | Status changes (pending→learning, learning→mastered) | Scale pop 1→1.25→0.95→1 + 6 colored particles fly outward |
| Decay Fade | Skill decaying | Glow gradually dims over time |

### UI Animations
| Animation | When | Effect |
|-----------|------|--------|
| Hover lift | Card/button hover | translateY(-2px) + scale(1.01-1.02) + enhanced shadow/glow |
| Button glow | CTA hover | box-shadow expands from 24px to 36px spread |
| Gradient shift | Hero text | background-position animates 6s infinite |
| Ambient float | Background blobs | translate(60px, 40px) oscillation 20-25s |
| Page transition | Route change | Fade + subtle slide |

## Components

### Buttons
- **Primary (Glow):** Gradient Electric→Hot Pink, white text, glow shadow, spring hover
- **Glass:** Semi-transparent + blur, border, no fill color
- **Dopamine colors:** Each category color as a button variant with matching glow
- **Danger:** 12% opacity red background, red text, red border
- **All buttons:** border-radius: full (pill shape), font-weight: 600

### Tags/Badges
- **Structure:** Dot indicator + label, pill shape
- **Dark mode:** 10% opacity background + matching border + dot glow
- **Light mode:** 10% opacity tint background + text in category color

### Cards
- **Dark mode:** Glass card with rgba(255,255,255,0.05) + blur + 1px rgba border
- **Light mode:** White card with subtle shadow + 1px border
- **Hover:** Lift + enhanced shadow/glow + border brightens

### Inputs
- **Background:** Slightly darker/lighter than surface
- **Focus:** Border changes to Lavender + 3px glow ring + background shift
- **Placeholder:** dim text color

### Alerts
- **Structure:** Icon circle (solid color) + message text
- **Background:** 8% opacity of semantic color
- **Border:** 15% opacity of semantic color
- **Icon:** Solid circle with glow shadow

### Skill Cards
- **Structure:** Category icon (colored square, rounded) + name/meta + status tag
- **Icon background:** 15% opacity of category color
- **Hover:** Lift + border brighten

## Interaction States

### Loading
- **Spinner:** 24px circle, 2px border, border-top-color = Lavender (dark) / Coral (light), animate spin 0.8s linear infinite
- **Skeleton:** Rounded rectangles at surface-hover color, subtle shimmer animation (gradient slide left-to-right, 1.5s ease infinite)
- **Page loading:** Centered spinner + text-dim caption below ("Loading..." in mono)

### Empty States
- **Structure:** Centered vertically, max-width 320px. Icon/illustration (32px, text-dim) + headline (H2, text-muted) + description (body, text-dim) + primary CTA button
- **Tone:** Warm and encouraging, not "error-like." Every empty state is an invitation to act.
- **Graph empty (Home, no skills):** Hero section with typewriter animation (existing), gradient text headline
- **Workspace empty (no sources):** 3-step guide: ① Add a source → ② Generate graph → ③ Explore & learn. CTA: "Add your first source"
- **Chat empty:** "Ask anything about your sources" + 3 example question chips in tag style

### Error States
- **Inline error:** Alert component (error variant) — red-tinted background, Cherry icon circle, clear message
- **Full-page error:** Centered layout like empty state, but with error icon + "Something went wrong" + retry button (secondary style)
- **Network error:** Toast notification (slide in from right, auto-dismiss 5s) + persistent retry button on affected section

### Theme Toggle Transition
- **Duration:** 200ms ease
- **What transitions:** background-color, color, border-color, box-shadow on `*` selector via `transition: background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s`
- **SkillGraph:** Instant re-render with new palette (no transition — D3 SVG doesn't support CSS transitions)
- **Default theme:** Dark mode. Respect `prefers-color-scheme` on first visit, then persist user choice to localStorage.

## Ambient Effects (Dark Mode)
- **Background gradient blobs:** 2 fixed circles (Electric and Hot Pink), 500-600px diameter, blur(120px), opacity 0.15, slow floating animation
- **Section ambient glow:** Radial gradient behind key sections (hero, graph), matching dominant color
- **Node glow:** Double box-shadow — inner tight (20px, 50% opacity) + outer diffuse (40px, 15% opacity)

## Ambient Effects (Light Mode)
- **Background:** Clean warm white, no dot grid
- **Subtle gradient wash:** Very faint gradient blobs at opacity 0.04-0.06
- **Node emphasis:** Box-shadow instead of glow (e.g., 0 4px 16px rgba(color, 0.3))

## Logo
- **Icon:** 30×30px rounded square (10px radius), gradient Electric→Hot Pink, layer icon (SVG) in white
- **Wordmark:** JetBrains Mono, 13px, weight 700, letter-spacing 0.12em, uppercase "ROADBOOK"
- **Dark mode:** Icon has glow shadow rgba(108,92,231,0.4)

## Share Card
- **Rainbow top bar:** 4px height, gradient through all dopamine colors (Cherry → Hot Pink → Lavender → Sky → Teal → Lime → Gold)
- **Corner ambient glow:** Radial gradient of Lavender at top-right
- **Stats:** Large display numbers in category colors
- **Tags:** Category-colored pill tags with dot indicators

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | Dopamine Max aesthetic with dark + light modes | User wanted playful, vibrant, iPhone-like design with bold dopamine colors. Dark mode as primary to make colors pop like neon. |
| 2026-03-19 | Satoshi + Plus Jakarta Sans + JetBrains Mono | Satoshi: geometric warmth for headlines. Plus Jakarta Sans: rounder than Inter, matches playful direction. JetBrains Mono: existing brand DNA. |
| 2026-03-19 | Category-based color coding for skill nodes | Each knowledge domain gets a dedicated high-saturation color, making the graph itself a colorful map. |
| 2026-03-19 | Glassmorphism cards + ambient glow blobs | User explicitly requested glass effects + gradient backgrounds. Creates depth and premium feel. |
| 2026-03-19 | Particle burst on skill unlock | Deliberate dopamine feedback — every status change has visual reward. Not game-level celebration, but clear positive reinforcement. |
| 2026-03-19 | Rejected: pure white minimal, pure dark minimal | V1 dark minimal felt too cold. V2 light minimal felt too bland. User wanted maximum dopamine output. |
| 2026-03-19 | Separate dopamine palettes for dark vs light | Same neon colors look harsh on cream background. Light mode gets its own warmer, softer variant (e.g., Cherry #FF6B6B→#FF8A80, Sky #74B9FF→#81D4FA). |
| 2026-03-19 | White border + white halo on light mode nodes | Dark edge shadows looked ugly on warm background. White borders (2px) + white ring shadow give nodes a clean, glowing feel on light canvas. |
| 2026-03-19 | Warm beige pending nodes in light mode | Gray/dark pending nodes clashed with warm cream background. Changed to #FFF3E8 with dashed brown border. |
| 2026-03-19 | Warm ambient blobs (peach/gold) in light mode | Purple/pink blobs from dark mode felt cold on cream. Switched to peach #FFCC80 for warmth. |
