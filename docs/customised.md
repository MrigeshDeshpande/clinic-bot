# Clinic Bot — Customization & Roadmap

> **Last updated:** June 2026

---

## I. Currently Customizable (via Settings Tab)

### 1. Clinic Tab
| Setting | Storage | Affects |
|---|---|---|
| Tagline / Subtitle | `settings.clinic.subtitle` | Prescription header |
| Email | `settings.clinic.email` | Contact info on prescription |
| Instagram Handle | `settings.clinic.instagram` | Social link |
| Google Maps Review URL | `settings.google_maps.review_url` | WhatsApp review link |
| Timing — Mon–Sat | `settings.clinic.timing_mon_sat` | Prescription, booking |
| Timing — Sunday | `settings.clinic.timing_sun` | Prescription, booking |

### 2. Doctor Tab
| Setting | Storage | Affects |
|---|---|---|
| Qualifications | `settings.doctor.qualifications` | Prescription header |
| Registration Number | `settings.doctor.registration` | Prescription footer |
| Designation / Title | `settings.doctor.designation` | Prescription header |
| Signature Image | `settings.doctor.signature` | Prescription (placeholder — not yet connected) |
| Stamp Image | `settings.doctor.stamp` | Prescription (placeholder — not yet connected) |

### 3. Prescription Tab
| Setting | Storage | Affects |
|---|---|---|
| Primary Color | `settings.prescription.primary_color` | PDF header background |
| Accent Color | `settings.prescription.accent_color` | PDF subtitle & highlights |
| Watermark Text | `settings.prescription.watermark_text` | PDF watermark |
| Show Watermark | `settings.prescription.show_watermark` | PDF rendering |
| Show Rx Symbol | `settings.prescription.show_rx` | PDF rendering |
| Generic Substitution | `settings.prescription.generic_substitution` | PDF checkbox |
| Page Border | `settings.prescription.border_enabled` | PDF border |

### 4. Treatments Tab
| Setting | Storage | Affects |
|---|---|---|
| Favorite Treatments (checkbox + order) | `settings.treatments.favorites` | Treatment selector in visit page |
| Fee Overrides (per treatment) | `settings.treatments.feeOverrides` | Pricing in visit, reports |
| Custom Treatments (name + fee + category) | `settings.treatments.custom` | Treatment selector dropdown |

### 5. Checklists Tab
| Setting | Storage | Affects |
|---|---|---|
| Diagnosis Checkboxes | `settings.checklists.diagnosis` | Prescription diagnosis checklist |
| Diet & Advice Items | `settings.checklists.advice` | Prescription advice checklist |

### 6. Medicines Tab
| Setting | Storage | Affects |
|---|---|---|
| Medicine Salts (enable/disable per salt) | `settings.medicines.salts` | Prescription medicine search |
| Custom Medicines (name + category) | `settings.medicines.custom` | Prescription medicine search |
| Quick Prescription Templates | `settings.medicines.templates` | One-click prescription filling |
| Usage Stats (auto-generated) | `settings.medicines.usage` | Read-only — shows top 20 prescribed |

### 7. Visit Layout Tab
| Setting | Storage | Affects |
|---|---|---|
| Left Column order + visibility | `settings.visit_layout.leftColumn` | Visit page clinical pane |
| Right Column order + visibility | `settings.visit_layout.rightColumn` | Visit page sidebar |
| Drag-and-drop reorder | `@dnd-kit` | Immediate UI reorder |

---

## II. Currently Hardcoded (Not Yet Customizable)

### A. Static Config (`src/config/clinic.js`)
| Setting | Value |
|---|---|
| Clinic Name | "Shri Balaji Dental Clinic" |
| Phone | "+91 91833 74850" |
| UPI ID | `env.UPI_ID` |
| Address | Full address string |
| Doctor Name | "Dr. M. Vishnu Vardhan" |
| Treatment Aliases | Hardcoded mapping |
| Booking Horizon | 30 days |
| Slot Interval | 30 minutes |
| Time Zone | "Asia/Kolkata" |

### B. Sidebar Navigation (`src/app/dashboard/layout.js`)
```
Groups + Items (hardcoded NAV_GROUPS):
┌─ MAIN ──────────────────────────┐
│ Overview      → /dashboard       │
│ Appointments  → /appointments    │
│ Patients      → /patients        │
│ Statistics    → /stats           │
│ Log Visit     → /visit           │
├─ OPERATIONS ─────────────────────┤
│ Queue Board   → /queue           │
│ Schedule      → /schedule        │
│ Feedback      → /feedback        │
│ Due Reminders → /due-reminders   │
├─ SYSTEM ─────────────────────────┤
│ Settings      → /settings        │
└──────────────────────────────────┘
```

**Not customizable:** group labels, item labels, icons, order, visibility, hiding individual items.

### C. Page Headings (hardcoded per page)
| Route | Current `<h1>` | Current Subtitle |
|---|---|---|
| `/dashboard` | "Dashboard" | (date string) |
| `/dashboard/appointments` | "Appointments" | "All upcoming appointments" |
| `/dashboard/patients` | "Patients" | "Search and manage patient records" |
| `/dashboard/stats` | "Analytics" | "Practice overview and performance insights" |
| `/dashboard/visit` | "Log Visit" | (none) |
| `/dashboard/queue` | "Queue Board" | (date string) |
| `/dashboard/schedule` | "Schedule" | "Manage blocked dates and clinic holidays" |
| `/dashboard/feedback` | "Feedback" | "Patient satisfaction and reviews" |
| `/dashboard/due-reminders` | "Due Reminders" | "Send payment reminders to patients with outstanding dues" |
| `/dashboard/settings` | "Settings" | "Customize clinic info, doctor details, prescription design & checklists" |

**Discrepancy:** Sidebar says "Overview" → page says "Dashboard". Sidebar says "Statistics" → page says "Analytics".

### D. Theme & Visual Design
| Aspect | Current |
|---|---|
| Dark/Light mode | ✅ Working via ThemeContext + localStorage |
| Sidebar collapse | ✅ Working via SidebarContext |
| Brand color | Only on prescription PDF (primary + accent) |
| Sidebar active color | Hardcoded `blue-600` / `blue-50` |
| Sidebar width | Hardcoded `w-64` / `w-16` |
| Border radius | Tailwind defaults |
| Font sizes | Tailwind defaults |
| Button colors | Tailwind defaults |

### E. Dashboard Overview Page
| Widget | Customizable? |
|---|---|
| KPI Cards (4 stats) | No — hardcoded |
| Upcoming Appointments | No — hardcoded section |
| Recent Activity | No — hardcoded section |
| Today's Collection | No — hardcoded section |

### F. Global Search
| Setting | Current |
|---|---|
| Search scope | Patients only |
| Shortcut | `⌘K` hardcoded |
| Result limit | 5 hardcoded |

### G. Notification Preferences
Notifications panel exists but no settings for:
- Which events trigger notifications
- Sound on/off
- Email vs in-app

---

## III. Planned Customization — Sidebar + Theme (NEXT)

### Feature: Sidebar Navigation Editor

**New Settings Tab:** "Navigation" (8th tab, icon: `PanelLeft` or `Menu`)

#### Controls:

| Section | UI Pattern | Behavior |
|---|---|---|
| **Groups** | Drag-and-drop vertical list (`@dnd-kit`) | Reorder groups, inline edit group label text |
| **Nav Items per Group** | Drag-and-drop vertical list per group | Reorder, rename label, rename subtitle, toggle visibility, change icon |
| **Icon Picker** | Modal grid of ~50 lucide-react icons | Click icon → see preview → select |
| **Reset Defaults** | Single button | Restores original NAV_GROUPS + subtitles |

#### Data Shape (stored as `settings.navigation`):
```json
{
  "groups": [
    {
      "id": "main",
      "label": "MAIN",
      "enabled": true,
      "items": [
        {
          "id": "overview",
          "label": "Overview",
          "href": "/dashboard",
          "icon": "LayoutDashboard",
          "enabled": true,
          "subtitle": "Clinic overview and activity"
        }
      ]
    }
  ]
}
```

#### Sync to Page Headings:
- A `NavigationContext` provides the active nav config app-wide
- Each page replaces its hardcoded `<h1>` + subtitle with a `<PageHeading />` component
- `<PageHeading />` reads from `NavigationContext` by matching `pathname` to `item.href`
- When user renames "Appointments" → "Bookings", every reference updates instantly

### Feature: Theme Presets

**New Settings UI:** Radio/palette selector (could be its own "Theme" tab or a section within an existing tab)

#### Available Presets (6 themes):

| Preset | Active BG | Active Text | Icon Color | Primary Accent |
|---|---|---|---|---|
| **Default Blue** | `bg-blue-50` | `text-blue-600` | `text-blue-600` | `blue-500` |
| **Emerald** | `bg-emerald-50` | `text-emerald-600` | `text-emerald-600` | `emerald-500` |
| **Violet** | `bg-violet-50` | `text-violet-600` | `text-violet-600` | `violet-500` |
| **Amber/Warm** | `bg-amber-50` | `text-amber-600` | `text-amber-600` | `amber-500` |
| **Rose** | `bg-rose-50` | `text-rose-600` | `text-rose-600` | `rose-500` |
| **Slate/Dark** | `bg-white/10` | `text-white` | `text-white` | `slate-300` |

- Applied as CSS variables on `<html>` via `ThemePresetContext`
- Dark mode still works independently (preset colors adapt with `dark:` variants)
- Affects: sidebar active items, buttons, accent borders, icon colors, link colors

#### Data Shape (stored as `settings.theme_preset`):
```json
"theme_preset": "emerald"
```

### Implementation Steps (ordered):

| # | Step | Key Files |
|---|---|---|
| 1 | Add `navigation` + `theme_preset` defaults to settings API seed data | `api/dashboard/settings/route.js` |
| 2 | Create `NavigationContext` + `ThemePresetContext` | `layout.js` or new `src/contexts/` |
| 3 | Build reusable `IconPicker` component (icon grid modal) | `src/components/IconPicker.js` |
| 4 | Build **Navigation** settings tab (drag-and-drop groups + items, rename, icon picker, visibility toggles, reset) | `settings/page.js` |
| 5 | Build **Theme Preset** selector UI (preview cards with preset colors) | `settings/page.js` |
| 6 | Refactor `layout.js` sidebar to read from `settings.navigation` instead of hardcoded `NAV_GROUPS` | `layout.js` |
| 7 | Refactor `layout.js` to apply theme preset CSS classes dynamically | `layout.js` |
| 8 | Create `<PageHeading />` component + update all 10 dashboard pages to use it | New component + 10 `page.js` files |
| 9 | Migration: add navigation + theme_preset seed to existing DBs | `pool.js` or settings API |

---

## IV. Future Customization Opportunities (Longer Term)

| Area | What Could Be Customized |
|---|---|
| **Clinic Profile** | Move all `clinic.js` static config into settings DB (name, phone, address, UPI, hours, slot interval, booking horizon, timezone) |
| **Dashboard Widgets** | Show/hide + reorder KPI cards, upcoming, recent activity, collection |
| **Prescription Layout** | Customize PDF layout beyond colors (font family, spacing, columns, logo position) |
| **Doctor Images** | Wire up real file upload for signature + stamp images |
| **Global Branding** | Apply primary/accent colors from prescription settings to the entire dashboard UI |
| **Sidebar Width** | Configurable expanded width (e.g. 56px/64px/72px collapsed) |
| **Global Search** | Configurable search scope (patients only vs. include visits/appointments), result limit |
| **Notifications** | Opt-in/out per event type, sound toggle |
| **Font Preferences** | Dashboard font family selection (Inter, Geist, etc.) |
| **Language / i18n** | Dashboard UI language toggle (English ↔ Hindi patient labels already exist in config) |
