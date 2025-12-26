import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with proper precedence handling
 * Combines clsx for conditional classes with twMerge for Tailwind overrides
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
