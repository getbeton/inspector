'use client'

import { useCallback, useState } from 'react'
import { useCanvas } from './use-canvas'
import { CHART_COLORS, CHART_CHROME, hexToRgba } from './palette'

interface DualLineChartProps {
  /** Labels for X-axis */
  labels: string[]
  /** Data series A (signal users) */
  seriesA: number[]
  /** Data series B (non-signal users) */
  seriesB: number[]
  /** Label for series A */
  labelA?: string
  /** Label for series B */
  labelB?: string
  /** Format function for values */
  formatValue?: (v: number) => string
  height?: number
  /** Color for series A (default: signal blue) */
  colorA?: string
  /** Color for series B (default: noSignal amber) */
  colorB?: string
}

/**
 * Dual area-filled line chart with hover tooltips.
 * Used for Conversion Rate, ACV, and Time-to-Conversion charts.
 */
export function DualLineChart({
  labels,
  seriesA,
  seriesB,
  labelA = 'With signal',
  labelB = 'Without signal',
  formatValue = (v) => v.toFixed(1),
  height = 240,
  colorA = CHART_COLORS.signal,
  colorB = CHART_COLORS.noSignal,
}: DualLineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const n = Math.min(labels.length, seriesA.length, seriesB.length)
      if (n === 0) return

      const pad = { top: 20, right: 60, bottom: 36, left: 52 }
      const chartW = w - pad.left - pad.right
      const chartH = h - pad.top - pad.bottom

      const allVals = [...seriesA.slice(0, n), ...seriesB.slice(0, n)]
      const minVal = Math.min(...allVals)
      const maxVal = Math.max(...allVals)
      const range = maxVal - minVal || 1
      const yMin = Math.max(0, minVal - range * 0.1)
      const yMax = maxVal + range * 0.1

      const xStep = n > 1 ? chartW / (n - 1) : chartW
      const yScale = chartH / (yMax - yMin)

      const toX = (i: number) => pad.left + i * xStep
      const toY = (v: number) => pad.top + chartH - (v - yMin) * yScale

      // Grid
      ctx.strokeStyle = CHART_CHROME.grid
      ctx.lineWidth = 1
      const gridSteps = 4
      for (let i = 0; i <= gridSteps; i++) {
        const y = pad.top + (chartH / gridSteps) * i
        ctx.beginPath()
        ctx.moveTo(pad.left, y)
        ctx.lineTo(w - pad.right, y)
        ctx.stroke()

        const val = yMax - ((yMax - yMin) / gridSteps) * i
        ctx.fillStyle = CHART_CHROME.label
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(formatValue(val), pad.left - 8, y + 4)
      }

      // X-axis labels
      for (let i = 0; i < n; i++) {
        // Show every label if <= 13, otherwise skip some
        if (n <= 13 || i % Math.ceil(n / 12) === 0 || i === n - 1) {
          ctx.fillStyle = CHART_CHROME.label
          ctx.font = '10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(labels[i], toX(i), h - pad.bottom + 16)
        }
      }

      // Draw filled areas + lines
      const drawSeries = (series: number[], color: string) => {
        // Area fill
        ctx.beginPath()
        ctx.moveTo(toX(0), toY(0))
        for (let i = 0; i < n; i++) {
          ctx.lineTo(toX(i), toY(series[i]))
        }
        ctx.lineTo(toX(n - 1), pad.top + chartH)
        ctx.lineTo(toX(0), pad.top + chartH)
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, 0.08)
        ctx.fill()

        // Line
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          if (i === 0) ctx.moveTo(toX(i), toY(series[i]))
          else ctx.lineTo(toX(i), toY(series[i]))
        }
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()

        // Dots
        for (let i = 0; i < n; i++) {
          ctx.beginPath()
          ctx.arc(toX(i), toY(series[i]), 3, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }

        // End label
        const lastVal = series[n - 1]
        ctx.fillStyle = color
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(formatValue(lastVal), toX(n - 1) + 8, toY(lastVal) + 4)
      }

      drawSeries(seriesA, colorA)
      drawSeries(seriesB, colorB)

      // Hover crosshair + tooltip
      if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < n) {
        const x = toX(hoverIdx)

        // Vertical line
        ctx.strokeStyle = CHART_CHROME.axis
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(x, pad.top)
        ctx.lineTo(x, pad.top + chartH)
        ctx.stroke()
        ctx.setLineDash([])

        // Tooltip background
        const valA = seriesA[hoverIdx]
        const valB = seriesB[hoverIdx]
        const delta = valA - valB
        const tooltipLines = [
          labels[hoverIdx],
          `${labelA}: ${formatValue(valA)}`,
          `${labelB}: ${formatValue(valB)}`,
          `Delta: ${delta >= 0 ? '+' : ''}${formatValue(delta)}`,
        ]

        const tooltipW = 160
        const tooltipH = tooltipLines.length * 18 + 12
        let tx = x + 12
        if (tx + tooltipW > w - pad.right) tx = x - tooltipW - 12

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.beginPath()
        ctx.roundRect(tx, pad.top + 4, tooltipW, tooltipH, 4)
        ctx.fill()

        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'left'
        tooltipLines.forEach((line, i) => {
          ctx.fillStyle = i === 0 ? '#aaa' : '#e8e8e8'
          if (i === 3) ctx.fillStyle = delta >= 0 ? CHART_COLORS.revenue : CHART_COLORS.vermillion
          ctx.fillText(line, tx + 8, pad.top + 20 + i * 18)
        })
      }
    },
    [labels, seriesA, seriesB, labelA, labelB, formatValue, colorA, colorB, hoverIdx]
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
