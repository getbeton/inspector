'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, onCheckedChange, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null)
    const combinedRef = (ref as React.RefObject<HTMLInputElement>) || innerRef

    React.useEffect(() => {
      if (combinedRef.current) {
        combinedRef.current.indeterminate = indeterminate || false
      }
    }, [indeterminate, combinedRef])

    return (
      <input
        type="checkbox"
        ref={combinedRef}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className={cn(
          'h-4 w-4 rounded border border-primary ring-offset-background accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
          className
        )}
        {...props}
      />
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }
