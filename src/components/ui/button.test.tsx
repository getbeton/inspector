import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders with default variant', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeDefined()
  })

  it('renders with different variants', () => {
    const { rerender } = render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="outline">Outline</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button variant="link">Link</Button>)
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('renders with different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button')).toBeDefined()

    rerender(<Button size="icon">I</Button>)
    expect(screen.getByRole('button')).toBeDefined()
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', () => {
    const handleClick = vi.fn()
    render(<Button disabled onClick={handleClick}>Disabled</Button>)

    const button = screen.getByRole('button')
    expect(button).toHaveProperty('disabled', true)

    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

})
