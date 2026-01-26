/**
 * coss ui - Copy-paste component library
 * Built on Base UI with Tailwind CSS
 *
 * This directory contains all UI components. Add new components here
 * following the established patterns.
 */

// Layout Components
export { Button, buttonVariants } from './button'
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card'
export { Badge, badgeVariants } from './badge'

// Form Components
export { Input, type InputProps } from './input'
export { Checkbox } from './checkbox'
export { Label } from './label'

// Feedback Components
export { Alert, AlertTitle, AlertDescription, AlertAction } from './alert'
export { Progress, ProgressLabel, ProgressTrack, ProgressIndicator, ProgressValue } from './progress'
export { Meter, MeterLabel, MeterTrack, MeterIndicator, MeterValue } from './meter'
export { Spinner } from './spinner'
export { ToastProvider, toastManager, AnchoredToastProvider, anchoredToastManager, type ToastPosition } from './toast'

// Overlay Components
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogBackdrop,
  DialogBackdrop as DialogOverlay,
  DialogPopup,
  DialogPopup as DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogPanel,
  DialogViewport,
  DialogCreateHandle
} from './dialog'
export {
  Popover,
  PopoverTrigger,
  PopoverPopup,
  PopoverPopup as PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverClose,
  PopoverCreateHandle
} from './popover'
export {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipPopup as TooltipContent,
  TooltipProvider,
  TooltipCreateHandle
} from './tooltip'

// Layout Utilities
export { Separator } from './separator'
export { ScrollArea, ScrollBar } from './scroll-area'

// Re-export commonly used Tailwind utility hooks
export { cn } from '@/lib/utils'
