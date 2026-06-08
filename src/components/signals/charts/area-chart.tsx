'use client'

import { useCallback, useState } from 'react'
import { useCanvas } from './use-canvas'
import { CHART_COLORS, CHART_CHROME, hexToRgba } from './palette'

interface AreaChartProps {
  labels: string[]
  data: number[]
  color?: string
  formatValue?: (v: number) => string
  height?: number
}

/** Single-series area-filled line chart (e.g., Signal Occurrences) */
export function AreaChart({
  labels,
  data,
  color = CHART_COLORS.signal,
  formatValue = (v) => v.toLocaleString(),
  height = 200,
}: AreaChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const n = Math.min(labels.length, data.length)
      if (n === 0) return

      const pad = { top: 20, right: 60, bottom: 36, left: 52 }
      const chartW = w - pad.left - pad.right
      const chartH = h - pad.top - pad.bottom

      const maxVal = Math.max(...data.slice(0, n), 1)
      const xStep = n > 1 ? chartW / (n - 1) : chartW
      const yScale = chartH / maxVal

      const toX = (i: number) => pad.left + i * xStep
      const toY = (v: number) => pad.top + chartH - v * yScale

      // Grid lines
      ctx.strokeStyle = CHART_CHROME.grid
      ctx.lineWidth = 1
      const gridSteps = 4
      for (let i = 0; i <= gridSteps; i++) {
        const y = pad.top + (chartH / gridSteps) * i
        ctx.beginPath()
        ctx.moveTo(pad.left, y)
        ctx.lineTo(w - pad.right, y)
        ctx.stroke()

        const val = maxVal - (maxVal / gridSteps) * i
        ctx.fillStyle = CHART_CHROME.label
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(formatValue(val), pad.left - 8, y + 4)
      }

      // X-axis labels
      for (let i = 0; i < n; i++) {
        if (n <= 13 || i % Math.ceil(n / 12) === 0 || i === n - 1) {
          ctx.fillStyle = CHART_CHROME.label
          ctx.font = '10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(labels[i], toX(i), h - pad.bottom + 16)
        }
      }

      // Area fill
      ctx.beginPath()
      ctx.moveTo(toX(0), toY(0))
      for (let i = 0; i < n; i++) {
        ctx.lineTo(toX(i), toY(data[i]))
      }
      ctx.lineTo(toX(n - 1), pad.top + chartH)
      ctx.lineTo(toX(0), pad.top + chartH)
      ctx.closePath()
      ctx.fillStyle = hexToRgba(color, 0.08)
      ctx.fill()

      // Line
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(toX(i), toY(data[i]))
        else ctx.lineTo(toX(i), toY(data[i]))
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      // Dots
      for (let i = 0; i < n; i++) {
        ctx.beginPath()
        ctx.arc(toX(i), toY(data[i]), 3, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }

      // End label
      const lastVal = data[n - 1]
      ctx.fillStyle = color
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(formatValue(lastVal), toX(n - 1) + 8, toY(lastVal) + 4)

      // Hover
      if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < n) {
        const x = toX(hoverIdx)
        const y = toY(data[hoverIdx])

        // Crosshair
        ctx.strokeStyle = CHART_CHROME.axis
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(x, pad.top)
        ctx.lineTo(x, pad.top + chartH)
        ctx.stroke()
        ctx.setLineDash([])

        // Highlight dot
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.stroke()

        // Tooltip
        const text = `${labels[hoverIdx]}: ${formatValue(data[hoverIdx])}`
        const metrics = ctx.measureText(text)
        const tw = metrics.width + 16
        let tx = x + 12
        if (tx + tw > w - pad.right) tx = x - tw - 12

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.beginPath()
        ctx.roundRect(tx, y - 14, tw, 28, 4)
        ctx.fill()

        ctx.fillStyle = '#e8e8e8'
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(text, tx + 8, y + 4)
      }
    },
    [labels, data, color, formatValue, hoverIdx]
  )

  const onHover = useCallback(
    (mx: number, _my: number, w: number) => {
      const pad = { left: 52, right: 60 }
      const chartW = w - pad.left - pad.right
      const n = labels.length
      if (n <= 1) return

      const relX = mx - pad.left
      const step = chartW / (n - 1)
      const idx = Math.round(relX / step)
      setHoverIdx(idx >= 0 && idx < n ? idx : null)
    },
    [labels.length]
  )

  const onLeave = useCallback(() => setHoverIdx(null), [])
  const { canvasRef, containerRef } = useCanvas({ draw, onHover, onLeave })

  return (
    <div ref={containerRef} style={{ height }} className="w-full relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
