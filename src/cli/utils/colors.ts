/**
 * Terminal ANSI color helpers for CLI output
 */

export const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  white: (s: string) => `\x1b[37m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42m${s}\x1b[0m`,
  bgYellow: (s: string) => `\x1b[43m${s}\x1b[0m`,
  bgBlue: (s: string) => `\x1b[44m${s}\x1b[0m`,
}

export function scoreColor(score: number): (s: string) => string {
  if (score >= 80) return colors.green
  if (score >= 60) return colors.blue
  if (score >= 40) return colors.yellow
  if (score >= 20) return colors.red
  return (s: string) => colors.dim(colors.red(s))
}

export function statusColor(status: string): (s: string) => string {
  switch (status.toLowerCase()) {
    case 'active':
    case 'enabled':
    case 'connected':
    case 'healthy':
    case 'completed':
      return colors.green
    case 'trial':
    case 'draft':
    case 'running':
    case 'pending':
      return colors.yellow
    case 'churned':
    case 'disabled':
    case 'failed':
    case 'error':
    case 'critical':
      return colors.red
    case 'inactive':
    case 'not connected':
      return colors.dim
    default:
      return (s: string) => s
  }
}

export function gradeColor(grade: string): (s: string) => string {
  switch (grade) {
    case 'M100': return colors.green
    case 'M75': return colors.blue
    case 'M50': return colors.yellow
    case 'M25': return colors.red
    case 'M10': return (s: string) => colors.dim(colors.red(s))
    default: return colors.dim
  }
}
