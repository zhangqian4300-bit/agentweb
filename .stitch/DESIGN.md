# Design System: AgentWeb

## 1. Visual Theme & Atmosphere

A precise, developer-grade marketplace interface with the cadence of a well-organized terminal dashboard married to the spaciousness of a curated gallery. The density sits at 6 — enough to scan dozens of agent listings without drowning in data. Variance at 6 — asymmetric hero compositions and offset grids prevent the generic SaaS look, while remaining navigable for repeat visitors. Motion at 5 — purposeful spring transitions on interactive elements and staggered card reveals, never gratuitous choreography.

The atmosphere is **technical confidence**: the feeling of a package registry designed by someone who cares about whitespace. Cool-neutral surfaces with a single, restrained teal accent that reads as "networked intelligence" without drifting into the AI-purple cliche. Every pixel earns its place. The platform sells capability, not hype.

## 2. Color Palette & Roles

### Light Mode
- **Snow Canvas** (#FAFBFC) — Primary background surface, the ground plane
- **Pure Surface** (#FFFFFF) — Card fills, elevated containers, input backgrounds
- **Zinc Ink** (#18181B) — Primary text, headlines, high-contrast labels (Zinc-950)
- **Slate Secondary** (#64748B) — Descriptions, metadata, secondary copy (Slate-500)
- **Mist Tertiary** (#94A3B8) — Timestamps, inactive states, placeholder text (Slate-400)
- **Whisper Border** (#E2E8F0) — Card borders, dividers, structural lines at 1px (Slate-200)
- **Frost Wash** (#F1F5F9) — Section backgrounds, sidebar fills, tag backgrounds (Slate-100)
- **Teal Signal** (#0D9488) — Single accent for CTAs, active states, focus rings, online indicators (Teal-600, saturation ~72%)
- **Teal Tint** (#CCFBF1) — Accent surface for selected filters, active tab backgrounds (Teal-100)
- **Destructive Red** (#DC2626) — Error states, offline indicators, destructive actions only (Red-600)
- **Bounty Amber** (#D97706) — Bounty/reward amounts, task-specific accent (Amber-600, used sparingly alongside teal)

### Dark Mode
- **Void Canvas** (#0C0C0E) — Primary background, near-black with warm undertone
- **Elevated Surface** (#1C1C20) — Card fills, containers
- **Cloud Text** (#E4E4E7) — Primary text (Zinc-200)
- **Fog Secondary** (#A1A1AA) — Descriptions, metadata (Zinc-400)
- **Steel Tertiary** (#71717A) — Inactive, placeholder (Zinc-500)
- **Ember Border** (rgba(255,255,255,0.08)) — Structural borders, subtle separation
- **Deep Wash** (#18181B) — Section backgrounds (Zinc-900)
- **Teal Signal** (#2DD4BF) — Accent, brighter for dark backgrounds (Teal-400)
- **Teal Surface** (rgba(13,148,136,0.12)) — Accent surface wash

## 3. Typography Rules

- **Display / Headlines:** `Geist` — Track-tight (`-0.025em`), controlled scale. Hierarchy through weight (`600` for section heads, `700` for page titles) and color (Zinc Ink vs Slate Secondary), never through excessive size jumps. Maximum headline: `clamp(1.875rem, 4vw, 2.5rem)`. No headline exceeds `2.5rem` / `40px`
- **Body:** `Geist` — Weight `400`, leading `1.625`, max-width `65ch`. Secondary body in Slate Secondary. Line length enforced via container max-width, not per-element
- **Mono:** `Geist Mono` — For code snippets, API keys, agent endpoints, token counts, pricing numbers, response times. Weight `400`, size `0.8125rem` / `13px`. All numerical data in marketplace cards uses Mono
- **Scale:** `0.75rem` (12px caption) / `0.8125rem` (13px small) / `0.875rem` (14px body-sm) / `1rem` (16px body) / `1.125rem` (18px subtitle) / `1.5rem` (24px section) / `clamp(1.875rem, 4vw, 2.5rem)` (display)
- **Banned:** Inter. Generic system fonts for any customer-facing surface. Generic serifs (`Times New Roman`, `Georgia`, `Garamond`). Serif of any kind in dashboard/console views

## 4. Hero Section

The hero is a **left-aligned asymmetric split** — headline and search on the left 60%, a floating composition of agent cards or a subtle network topology illustration on the right 40%. Never centered. The headline is two lines maximum, weight `700`, in Zinc Ink. Subheadline in Slate Secondary, one line.

The search input is the hero's focal CTA — generous height (`3rem` / `48px`), rounded-full, with a subtle inset shadow. Single action button attached. No secondary CTAs, no "Learn more" links, no scroll indicators.

Background: flat Snow Canvas or a barely-perceptible radial gradient from Frost Wash center to Snow Canvas edges. No blue-50 gradients. No gradient text.

### Mobile Collapse
Below `768px`, the hero stacks to single column — headline, subheadline, search input. The right-side composition hides entirely. Search input goes full-width.

## 5. Component Stylings

### Buttons
- **Primary:** Teal Signal fill, white text. Rounded `0.5rem`. Height `2.5rem` default, `3rem` for hero/publish CTAs. Tactile `-1px translateY` on `:active`. Hover darkens fill 8%
- **Secondary/Ghost:** Transparent with Whisper Border outline. Zinc Ink text. Hover fills Frost Wash
- **Destructive:** Destructive Red fill, white text. Used only for delete/disconnect actions
- **No outer glows.** No neon shadows. No custom cursors. No gradient fills

### Cards (Agent Listings)
- Rounded `0.75rem` (`12px`). 1px Whisper Border. Pure Surface fill. On hover: translate `-2px` Y with a diffused shadow (`0 8px 24px rgba(0,0,0,0.06)`)
- Internal padding: `1.25rem` (`20px`)
- Agent name in `600` weight, `1.125rem`. Description in Slate Secondary, `line-clamp-2`
- Pricing in Geist Mono, Teal Signal color, right-aligned
- Online status: `6px` circle, Teal Signal when online, Mist Tertiary when offline
- Category badge: Frost Wash background, Slate Secondary text, rounded-full, `0.75rem` font
- **High-density alternative:** When listing more than 6 agents per row (compact mode), replace cards with a table-row layout — border-top dividers, no elevation, tighter `0.75rem` vertical padding

### Inputs & Forms
- Label above input, `0.875rem`, `500` weight, Zinc Ink. Helper text below in Mist Tertiary
- Input height `2.5rem`, Whisper Border, rounded `0.375rem`. Focus ring: `2px` Teal Signal at `40%` opacity
- No floating labels. Error text below in Destructive Red, `0.8125rem`
- Textareas: same border treatment, `min-height: 5rem`

### Tabs / Filters
- Pill-style tab bar: Frost Wash container with `0.25rem` padding. Active tab: Pure Surface fill, subtle shadow, Zinc Ink text. Inactive: transparent, Slate Secondary text
- Category filter pills: rounded-full, Frost Wash default, Teal Signal fill when active with white text
- Sort controls: plain text links, Teal Signal when active, Mist Tertiary when inactive

### Loading States
- Skeleton shimmer: Frost Wash base with a traveling highlight sweep (`200%` width, `1.5s` animation). Skeletons match exact card/row dimensions
- No circular spinners in content areas. Spinner only for isolated "waiting for connection" states: thin `2px` border ring in Teal Signal

### Empty States
- Centered illustration (line-art style, Slate Secondary + Teal Signal strokes) with a single-line message in Slate Secondary and one primary CTA button
- Never just "No data" text

### Badges / Status
- Grade badges (A/B/C/D): Teal Tint + Teal Signal for A, Frost Wash + Slate Secondary for B, Amber tint + Amber for C, Red tint + Red for D
- Online/offline dot: `6px`, Teal Signal / Mist Tertiary

## 6. Layout Principles

- **Grid system:** CSS Grid, `max-width: 80rem` (`1280px`) centered container with `1rem` horizontal padding, scaling to `1.5rem` above `768px`
- **Agent marketplace grid:** 2 columns on medium (`768px`+), 3 columns on large (`1024px`+). Never 4 equal columns. On hover, the active card lifts while siblings stay — no group transforms
- **Sidebar (console):** Fixed `14rem` (`224px`) width, Frost Wash background, border-right. Collapses to hamburger below `1024px`
- **Section spacing:** `clamp(3rem, 8vw, 6rem)` between major sections. Internal card gap: `1.5rem`
- **No overlapping elements.** Every element owns its spatial zone. No absolute-positioned decorative overlays
- **No flexbox percentage hacks.** Grid-only for multi-column layouts
- **Full-height sections:** `min-h-[100dvh]` — never `h-screen`
- **Content width constraint:** Body text and form fields never exceed `42rem` (`672px`) centered within the container

## 7. Responsive Rules

- **Mobile-first collapse (< 768px):** All multi-column grids become single column. No exceptions
- **No horizontal scroll.** Overflow-x hidden at the viewport level is a last resort, not a solution
- **Typography scaling:** Headlines via `clamp()`. Body minimum `1rem`. Mono minimum `0.75rem`
- **Touch targets:** All interactive elements minimum `44px` tap target. Category pills get `min-height: 2.5rem` on mobile
- **Images:** Any illustrative elements in the hero stack below content on mobile
- **Navigation:** Desktop horizontal nav in sticky header. Below `768px`: hamburger menu with sheet overlay
- **Spacing:** Section gaps reduce via `clamp()`. Card internal padding drops from `1.25rem` to `1rem`
- **Console sidebar:** Becomes a slide-out sheet below `1024px`, triggered by hamburger

## 8. Motion & Interaction

- **Spring physics:** `stiffness: 120, damping: 18` — slightly springy, never bouncy. All interactive element transitions use this curve, approximated in CSS as `cubic-bezier(0.22, 1, 0.36, 1)` with `200ms` duration
- **Card hover:** `translateY(-2px)` + shadow expansion over `200ms`. No scale transforms on cards
- **Staggered reveals:** Agent card grid mounts with `40ms` cascade delay per card, fading up from `translateY(8px)` + `opacity: 0`. Maximum stagger: `400ms` total for a full page
- **Button press:** `translateY(1px)` on `:active`, `80ms` snap
- **Tab transitions:** Active indicator slides with spring timing. Content cross-fades `150ms`
- **Skeleton shimmer:** Infinite traveling gradient, `1.5s` loop, `ease-in-out`
- **Online pulse:** `6px` status dot with a subtle infinite `scale(1) -> scale(1.4) -> scale(1)` pulse at `0.3` opacity, `2s` loop. Only on online agents
- **Performance:** Only animate `transform` and `opacity`. No `width`/`height`/`top`/`left` animations. Grain textures on fixed pseudo-elements only if used
- **Reduced motion:** Respect `prefers-reduced-motion` — collapse all springs to `0ms`, disable infinite loops

## 9. Anti-Patterns (Banned)

- No emojis in UI chrome (replace sidebar icons with Lucide/Radix icons)
- No `Inter` font — project uses Geist exclusively
- No generic serif fonts — sans-serif only across all views
- No pure black (`#000000`) — use Zinc Ink (#18181B) or Void Canvas (#0C0C0E)
- No neon outer glows, no purple/blue neon aesthetic
- No oversaturated accents — Teal Signal at ~72% saturation is the ceiling
- No gradient text on headers or any large element
- No custom mouse cursors
- No overlapping elements — clean spatial separation always
- No 3-column equal card layout without differentiation — use 2-col + featured, or asymmetric sizing
- No generic placeholder names ("John Doe", "Acme Corp", "Nexus AI")
- No fabricated metrics — never generate fake uptime, response times, or call counts. Use `[metric]` placeholders or omit
- No `LABEL // YEAR` formatting
- No AI copywriting cliches ("Elevate your workflow", "Seamless integration", "Unleash the power", "Next-Gen platform")
- No filler UI text ("Scroll to explore", scroll arrows, bouncing chevrons)
- No broken Unsplash links — use `picsum.photos` for photography or inline SVG illustrations
- No centered hero layouts — left-aligned asymmetric split is the standard
- No `bg-gradient-to-b from-blue-50 to-white` hero backgrounds — flat or barely-perceptible radial only
- No circular loading spinners in content areas — skeleton shimmer only
- No `h-screen` — use `min-h-[100dvh]` for full-height sections
