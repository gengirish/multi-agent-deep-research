import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

/**
 * Measures a container element's width and keeps it in sync via ResizeObserver,
 * so D3 charts can fill their parent instead of using a fixed pixel width.
 */
export const useResponsiveWidth = <T extends HTMLElement = HTMLDivElement>(
  fallback = 600
): [React.RefObject<T>, number] => {
  const containerRef = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setWidth(w)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [containerRef, width]
}

export const useD3 = (
  renderFn: (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void,
  dependencies: any[]
) => {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (ref.current) {
      const svg = d3.select(ref.current)
      svg.selectAll('*').remove() // Clear previous render
      renderFn(svg)
    }
    
    // Cleanup: remove any tooltips created by D3
    return () => {
      const tooltip = d3.select('body').select('.d3-tooltip')
      if (!tooltip.empty()) {
        tooltip.remove()
      }
    }
  }, dependencies)

  return ref
}

