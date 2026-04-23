/**
 * Stackle Design System — Color Tokens
 *
 * Light mode first. Premium, calm, structured SaaS aesthetic.
 * 90% white + grays. Primary and state colors used intentionally.
 */

// ─────────────────────────────────────────
// RAW PALETTE
// ─────────────────────────────────────────

export const palette = {
  // Primary / Brand (Indigo)
  primary: {
    50:  "#F5F7FF",
    100: "#EEF2FF",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
  },

  // Neutral / Base
  gray: {
    white: "#FFFFFF",
    50:    "#F9FAFB",
    100:   "#F3F4F6",
    200:   "#E5E7EB",
    300:   "#D1D5DB",
    400:   "#9CA3AF",
    500:   "#6B7280",
    600:   "#4B5563",
    700:   "#374151",
    800:   "#1F2937",
    900:   "#111827",
  },

  // Success (Green)
  green: {
    50:  "#F0FDF4",
    100: "#DCFCE7",
    500: "#22C55E",
    600: "#16A34A",
  },

  // Error / Danger (Red)
  red: {
    50:  "#FEF2F2",
    100: "#FEE2E2",
    500: "#EF4444",
    600: "#DC2626",
  },

  // Warning (Yellow/Amber)
  yellow: {
    50:  "#FFFBEB",
    100: "#FEF3C7",
    500: "#F59E0B",
    600: "#D97706",
  },

  // Informational (Blue) — use sparingly
  blue: {
    100: "#DBEAFE",
    600: "#2563EB",
  },
} as const;

// ─────────────────────────────────────────
// SEMANTIC TOKENS
// ─────────────────────────────────────────

export const tokens = {
  // Layout
  background:        palette.gray.white,      // App page background
  backgroundSubtle:  palette.gray[50],        // Sidebar, secondary panels
  backgroundMuted:   palette.gray[100],       // Input backgrounds, hover states

  // Surfaces
  cardBackground:    palette.gray.white,      // Cards, modals, panels
  cardBorder:        palette.gray[200],       // Card borders
  cardBorderHover:   palette.gray[300],       // Card border on hover

  // Text
  foreground:        palette.gray[900],       // Primary body text
  foregroundMuted:   palette.gray[500],       // Captions, metadata, placeholders
  foregroundSubtle:  palette.gray[400],       // Disabled text, hints
  foregroundOnDark:  palette.gray.white,      // Text on dark/primary backgrounds

  // Borders
  border:            palette.gray[200],       // Default borders
  borderStrong:      palette.gray[300],       // Emphasized borders
  borderFocus:       palette.primary[600],    // Focus rings

  // Primary (Brand / CTA)
  primary:           palette.primary[600],    // Primary buttons, active tabs, links
  primaryHover:      palette.primary[700],    // Primary hover state
  primarySubtle:     palette.primary[100],    // Chip backgrounds, highlights
  primaryForeground: palette.gray.white,      // Text on primary background

  // Sidebar
  sidebarBackground: palette.gray[50],        // Sidebar bg
  sidebarBorder:     palette.gray[200],       // Sidebar right border
  sidebarItemActive: palette.primary[100],    // Active nav item bg
  sidebarIconActive: palette.primary[600],    // Active nav icon
  sidebarIcon:       palette.gray[400],       // Default nav icon

  // State: Success
  success:           palette.green[600],
  successSubtle:     palette.green[100],
  successBackground: palette.green[50],

  // State: Danger
  danger:            palette.red[600],
  dangerSubtle:      palette.red[100],
  dangerBackground:  palette.red[50],

  // State: Warning
  warning:           palette.yellow[600],
  warningSubtle:     palette.yellow[100],
  warningBackground: palette.yellow[50],

  // State: Info (use sparingly)
  info:              palette.blue[600],
  infoSubtle:        palette.blue[100],
} as const;

// ─────────────────────────────────────────
// COMPONENT USAGE GUIDE
// ─────────────────────────────────────────

/**
 * BUTTON
 *   Primary:    bg=primary, text=white, hover=primaryHover
 *   Secondary:  bg=white, border=border, text=gray-700, hover=bg-gray-50
 *   Ghost:      bg=transparent, text=gray-600, hover=bg-gray-100
 *   Danger:     bg=red-600, text=white, hover=red-700
 *
 * CARD
 *   bg=white, border=gray-200, rounded-xl, shadow-sm
 *   Hover: border=gray-300, shadow-md
 *
 * CHIP (default)
 *   bg=gray-100, text=gray-700, border=gray-200
 *   Selected: bg=primary-100, text=primary-600, border=primary-200
 *
 * BADGE
 *   Neutral:  bg=gray-100,   text=gray-600
 *   Success:  bg=green-100,  text=green-600
 *   Danger:   bg=red-100,    text=red-600
 *   Warning:  bg=yellow-100, text=yellow-600
 *   Primary:  bg=primary-100,text=primary-600
 *
 * SIDEBAR ITEM
 *   Default:  text=gray-600, icon=gray-400, hover=bg-gray-100
 *   Active:   text=primary-600, icon=primary-600, bg=primary-50
 *
 * TABS
 *   Default:  text=gray-500, border-b=transparent
 *   Active:   text=primary-600, border-b=primary-600
 *   Hover:    text=gray-700
 *
 * ALERT STATES
 *   Success:  bg=green-50,  border-l=green-500, text=green-700
 *   Danger:   bg=red-50,    border-l=red-500,   text=red-700
 *   Warning:  bg=yellow-50, border-l=yellow-500, text=yellow-700
 *   Info:     bg=blue-50,   border-l=blue-500,   text=blue-700 (use sparingly)
 *
 * RESUME ANALYSIS STATES
 *   Strength:    bg=green-50,  text=green-700,  dot=green-500
 *   Weakness:    bg=red-50,    text=red-700,    dot=red-500
 *   Gap:         bg=yellow-50, text=yellow-700, dot=yellow-500
 *   ATS Low:     text=green-600, badge bg=green-100
 *   ATS Medium:  text=yellow-600, badge bg=yellow-100
 *   ATS High:    text=red-600, badge bg=red-100
 *
 * HERO GRADIENT (hero areas only)
 *   from-[#4F46E5] to-[#6366F1]         (solid indigo)
 *   from-[#F5F7FF] via-white to-white   (subtle tint fade — preferred)
 */

// ─────────────────────────────────────────
// HERO GRADIENT PRESETS
// ─────────────────────────────────────────

export const gradients = {
  heroPrimary:    "linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)",
  heroSubtle:     "linear-gradient(180deg, #F5F7FF 0%, #FFFFFF 60%)",
  heroCard:       "linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 100%)",
} as const;
