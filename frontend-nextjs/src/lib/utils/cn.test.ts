import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn utility', () => {
  it('merges class names', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('handles conditional classes', () => {
    const result = cn('base', true && 'included', false && 'excluded')
    expect(result).toBe('base included')
  })

  it('handles undefined and null values', () => {
    const result = cn('base', undefined, null, 'valid')
    expect(result).toBe('base valid')
  })

  it('merges Tailwind classes correctly', () => {
    // tailwind-merge should handle conflicting classes
    const result = cn('px-2 py-1', 'px-4')
    expect(result).toBe('py-1 px-4')
  })

  it('handles array of classes', () => {
    const result = cn(['class1', 'class2'])
    expect(result).toBe('class1 class2')
  })

  it('handles object notation', () => {
    const result = cn({
      'active-class': true,
      'inactive-class': false,
    })
    expect(result).toBe('active-class')
  })

  it('handles empty input', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('handles complex mixed input', () => {
    const isActive = true
    const result = cn(
      'base-class',
      isActive && 'active',
      { 'conditional': true },
      ['array-class']
    )
    expect(result).toBe('base-class active conditional array-class')
  })
})
