# UI Direction and Navigation (Proposal)

**Status:** Approved by Jeff on 2026-11-23: spruce accent, shorter navigation, laptop and iPad first. Visual preview (private to Jeff): https://claude.ai/artifact/6oWWEFTCikusLseEv43sBJ. It shows the desktop dashboard in light mode, the phone in dark mode, and the colors, type and components, all in spruce.

## The feel we're aiming for

**"The architect's notebook, kept on a warm kitchen table."** Precise and calm, with a little warmth.

- **Precision:** a strict spacing grid, thin hairline borders, aligned numbers (all figures the same width), and measurements shown the way a drawing would show them (`12′ 4½″`).
- **Warmth:** off-white "plaster" backgrounds instead of pure white, warm greys instead of blue-greys, and one deep spruce-green accent.
- **Quiet:** one accent color, used sparingly. No gradients and no decorative charts. Every chart answers a question.
- **Consumer, not enterprise:** plain words ("Spent", "Still to pay", "Left to plan") rather than accounting jargon, with the precise term in a tooltip.

## Design tokens (first draft)

| Token        | Light             | Dark      | Use                                                                                                                                                     |
| ------------ | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background` | `#F7F5F1` plaster | `#141311` | Page background                                                                                                                                         |
| `surface`    | `#FFFFFF`         | `#1C1B18` | Cards, panels                                                                                                                                           |
| `border`     | `#E4E0D8`         | `#2E2C28` | Hairlines                                                                                                                                               |
| `text`       | `#1F1E1C` ink     | `#EDEAE4` | Body text                                                                                                                                               |
| `text-muted` | `#6B665E`         | `#A39D93` | Labels, secondary text                                                                                                                                  |
| `accent`     | `#2F5D50` spruce  | `#6FA593` | Main buttons, active nav, focus rings                                                                                                                   |
| `positive`   | `#557A2E` moss    | `#9BC06A` | Under budget, done. This is a yellower green than spruce, so "good" never looks like the accent, and it always comes with a check icon or a text label. |
| `warning`    | `#A8741A` ochre   | `#E0AE55` | Due soon, close to the limit                                                                                                                            |
| `danger`     | `#A63A32` brick   | `#E57B72` | Over budget, overdue                                                                                                                                    |
| `info`       | `#3C5E7A` slate   | `#8DB0CF` | Scheduled, informational                                                                                                                                |

- All text and background pairs must meet **WCAG AA** contrast (we check this in Milestone 1).
- **Corner radius:** 10px on cards, 8px on inputs and buttons. **Spacing:** a 4px base grid.
- **Light and dark mode:** follows the system setting, with a manual switch in Settings.

## Typography

- **Geist Sans** for interface text, and **Geist Mono** for money, measurements and IDs. Both are free and load through Next.js.
- **Sizes:** 13 / 14 (body) / 16 / 20 / 24 / 32. Headings use semibold weight with slightly tighter letter spacing.
- Money always uses tabular figures and lines up on the right in tables.

## Icons

**Lucide** icons, 1.5px stroke, 16 or 20px, everywhere. No mixing icon sets.

## Navigation proposal

The 12 areas in the brief are grouped so the sidebar shows **8 items plus Settings**:

```
┌──────────────────────────────┐
│  ⌂ BeamHaven                 │
│  [ 1428 Elm St        ▾ ]    │  ← property switcher (hidden when there's only one)
│                              │
│  Home                        │  Dashboard
│  Projects                    │
│  Rooms                       │
│  Budget                      │  includes budget reports
│  Schedule                    │  tasks + calendar
│                              │
│  PEOPLE & THINGS             │
│  Contractors                 │
│  Materials                   │  includes orders and deliveries
│                              │
│  LIBRARY                     │
│  Files                       │  documents, photos, floor plans
│  Inspiration                 │  design boards
│                              │
│  ─────────────               │
│  Reports                     │  cross-cutting reports and exports (M9)
│  Assistant                   │  only shown once AI is turned on (M11)
│  Settings                    │
│  (avatar) Jeff  ▾            │
└──────────────────────────────┘
```

Why:

- **Reports** are mostly budget questions, so budget reports live inside **Budget**. The separate Reports page only appears in M9, for exports that cover everything.
- **Documents + photos + floor plans → "Files".** People think "where's that PDF?", not "which type of document is it?". Filters handle the types.
- **Design Boards → "Inspiration".** It's a friendlier word for homeowners.
- **The AI Assistant** stays hidden until it's enabled, so there is never a dead menu item.
- Items are only shown in the sidebar once their milestone is built. Before then, the menu hides them rather than showing empty "coming soon" pages.

### Inside a project

A project page has a header (name, status, dates and a budget health bar) and tabs:

**Overview · Rooms · Budget · Tasks · Contractors · Materials · Files · Activity**

Room pages follow the same pattern: **Overview · Measurements · Projects · Budget · Files · Inspiration**.

### Screen sizes

We design for **laptop and iPad first**, which is how Jeff expects to use it. On iPad, the sidebar collapses to icons in portrait and stays fully open in landscape. Every touch target is at least 44px, so it works with fingers as well as a mouse.

### Phone (comes later, but kept usable)

- A bottom tab bar: **Home · Projects · Budget · Schedule · More**.
- A floating **+** button for the three most common quick actions: add an expense (with a receipt photo), add a photo, add a task.
- Tables turn into stacked cards on narrow screens.

## The Home dashboard (target for M9; a simple version ships earlier)

The layout, from top to bottom:

1. **A greeting and quick actions:** Add expense · Add photo · Add task.
2. **A budget summary card:** current budget, spent, still to pay, left to plan, with one horizontal bar, not a chart wall.
3. **Active projects:** cards showing status, a date range, a budget health indicator and the next milestone.
4. **"Needs attention":** overdue tasks, bills due within 7 days, quotes waiting for a decision, deliveries due.
5. **This week:** an agenda list of appointments, deliveries and inspections.
6. **Recent activity:** the last 10 events, each linking to its record.

## Components we'll build once and reuse

App shell, page header, stat tile, money display, measurement display and input (accepts `12' 4 1/2"`), status badge, data table, empty state, confirm dialog, form field (label, help text, error), file drop zone, activity item, and progress or budget bar.

## Decisions (2026-11-23)

1. **Accent color:** spruce green (`#2F5D50` in light mode, `#6FA593` in dark mode).
2. **Navigation:** the consolidated version above is approved.
3. **Main devices:** laptop and iPad. The phone layout must work, but gets less polish at first.
