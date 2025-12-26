/**
 * coss ui - Copy-paste component library
 * Built on Base UI with Tailwind CSS
 *
 * This directory contains all UI components. Add new components here
 * following the established patterns.
 */

// Layout Components
export { Button, type ButtonProps, buttonVariants } from './button'
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card'
export { Badge, type BadgeProps, badgeVariants } from './badge'

// Form Components
export { Input, type InputProps } from './input'
export { Checkbox, type CheckboxProps } from './checkbox'

// Re-export commonly used Tailwind utility hooks
export { cn } from '@/lib/utils/cn'
