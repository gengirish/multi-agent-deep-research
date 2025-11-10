import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

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
  }, dependencies)

  return ref
}

