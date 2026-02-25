/**
 * Okabe-Ito colorblind-safe palette for signal analytics charts.
 * Matches the design sketch's color system.
 */

export const CHART_COLORS = {
  signal: '#0072B2',       // Blue — users WITH signal
  noSignal: '#E69F00',     // Amber — users WITHOUT signal
  revenue: '#009E73',      // Teal — attributed revenue / positive delta
  revenueBase: '#56B4E9',  // Sky — baseline/other revenue
  vermillion: '#D55E00',   // Vermillion — alerts/negative delta
  rose: '#CC79A7',         // Rose — tertiary
  sky: '#56B4E9',          // Sky — highlight
  yellow: '#F0E442',       // Yellow — accent
} as const

/** Per-customer breakdown colors (stacked bar segments) */
export const CUSTOMER_COLORS = [
  '#009E73', '#D55E00', '#CC79A7', '#F0E442', '#56B4E9', '#E69F00', '#0072B2',
]

/** Chart chrome / grid colors (adapt to light/dark via CSS vars) */
export const CHART_CHROME = {
  grid: 'rgba(128, 128, 128, 0.1)',
  axis: 'rgba(128, 128, 128, 0.3)',
  label: 'rgba(128, 128, 128, 0.6)',
} as const

/** Convert hex to rgba */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
