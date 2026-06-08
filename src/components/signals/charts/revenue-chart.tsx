'use client'

import { useCallback, useState } from 'react'
import { useCanvas } from './use-canvas'
import { CHART_COLORS, CUSTOMER_COLORS, CHART_CHROME, hexToRgba } from './palette'
import type { SignalAnalyticsSnapshot, CustomerBreakdown } from '@/lib/api/signals'

interface RevenueChartProps {
  snapshots: SignalAnalyticsSnapshot[]
  height?: number
}

/** Stacked bar chart: signal revenue (top, blue) + other revenue (bottom, sky) */
export function RevenueChart({ snapshots, height = 280 }: RevenueChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (snapshots.length === 0) return

      const pad = { top: 24, right: 16, bottom: 36, left: 52 }
      const chartW = w - pad.left - pad.right
      const chartH = h - pad.top - pad.bottom

      const n = snapshots.length
      const gap = 4
      const barW = Math.max(12, (chartW - (n - 1) * gap) / n)

      // Find max total
      const maxVal = Math.max(
        ...snapshots.map(s => (s.revenue_signal || 0) + (s.revenue_other || 0)),
        1
      )
      const yScale = chartH / maxVal

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

        // Y-axis labels
        const val = maxVal - (maxVal / gridSteps) * i
        ctx.fillStyle = CHART_CHROME.label
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(`$${Math.round(val)}K`, pad.left - 8, y + 4)
      }

      // Bars
      for (let i = 0; i < n; i++) {
        const s = snapshots[i]
        const x = pad.left + i * (barW + gap)
        const revSignal = s.revenue_signal || 0
        const revOther = s.revenue_other || 0
        const total = revSignal + revOther

        const barHOther = revOther * yScale
        const barHSignal = revSignal * yScale

        const alpha = hoverIdx !== null && hoverIdx !== i ? 0.3 : 1.0

        // Bottom: other revenue (sky)
        ctx.globalAlpha = alpha
        ctx.fillStyle = CHART_COLORS.revenueBase
        ctx.fillRect(x, pad.top + chartH - barHOther, barW, barHOther)

        // Top: signal revenue
        if (hoverIdx === i && s.customer_breakdown && s.customer_breakdown.length > 0) {
          // Explode into per-customer segments
          drawCustomerBreakdown(ctx, s.customer_breakdown, x, pad.top + chartH - barHOther - barHSignal, barW, barHSignal)
        } else {
          ctx.fillStyle = CHART_COLORS.signal
          ctx.fillRect(x, pad.top + chartH - barHOther - barHSignal, barW, barHSignal)
        }

        ctx.globalAlpha = 1.0

        // Total label above bar
        if (total > 0) {
          ctx.fillStyle = CHART_CHROME.label
          ctx.font = '10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(
            `$${Math.round(total)}K`,
            x + barW / 2,
            pad.top + chartH - barHOther - barHSignal - 6
          )
        }

        // X-axis label (month)
        ctx.fillStyle = CHART_CHROME.label
        ctx.font = '10px system-ui, sans-serif'
        ctx.textAlign = 'center'
        const month = new Date(s.month + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
        })
        ctx.fillText(month, x + barW / 2, h - pad.bottom + 16)
      }
    },
    [snapshots, hoverIdx]
  )

  const onHover = useCallback(
    (mx: number, _my: number, w: number) => {
      const pad = { left: 52, right: 16 }
      const chartW = w - pad.left - pad.right
      const n = snapshots.length
      if (n === 0) return
      const gap = 4
      const barW = Math.max(12, (chartW - (n - 1) * gap) / n)

      const relX = mx - pad.left
      const idx = Math.floor(relX / (barW + gap))
      setHoverIdx(idx >= 0 && idx < n ? idx : null)
    },
    [snapshots.length]
  )

  const onLeave = useCallback(() => setHoverIdx(null), [])

  const { canvasRef, containerRef } = useCanvas({ draw, onHover, onLeave })

  return (
    <div ref={containerRef} style={{ height }} className="w-full relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}

function drawCustomerBreakdown(
  ctx: CanvasRenderingContext2D,
  customers: CustomerBreakdown[],
  x: number,
  y: number,
  w: number,
  totalH: number
) {
  const totalSpend = customers.reduce((sum, c) => sum + c.spend, 0)
  if (totalSpend <= 0) return

  let offsetY = 0
  for (let j = 0; j < customers.length; j++) {
    const h = (customers[j].spend / totalSpend) * totalH
    ctx.fillStyle = CUSTOMER_COLORS[j % CUSTOMER_COLORS.length]
    ctx.fillRect(x, y + offsetY, w, h)
    offsetY += h
  }
}
