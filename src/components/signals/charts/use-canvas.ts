'use client'

import { useRef, useEffect, useCallback } from 'react'

interface UseCanvasOptions {
  /** Called on every frame (resize, data change). ctx is already DPR-scaled. */
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
  /** Called when mouse moves over canvas. x,y are in CSS pixels. */
  onHover?: (x: number, y: number, width: number, height: number) => void
  /** Called when mouse leaves canvas. */
  onLeave?: () => void
}

/**
 * Hook that manages a canvas element with proper DPR scaling,
 * resize observation, and mouse event forwarding.
 */
export function useCanvas({ draw, onHover, onLeave }: UseCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const drawRef = useRef(draw)
  drawRef.current = draw

  const render = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    drawRef.current(ctx, width, height)
  }, [])

  // Observe container size and redraw
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    render()

    const observer = new ResizeObserver(() => render())
    observer.observe(container)

    return () => observer.disconnect()
  }, [render])

  // Re-render when draw function changes (data updates)
  useEffect(() => {
    render()
  }, [draw, render])

  // Mouse events
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!onHover) return
      const rect = container.getBoundingClientRect()
      onHover(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height)
    }

    const handleMouseLeave = () => {
      onLeave?.()
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [onHover, onLeave])

  return { canvasRef, containerRef, render }
}
