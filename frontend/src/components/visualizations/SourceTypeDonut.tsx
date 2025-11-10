import React from 'react'
import * as d3 from 'd3'
import { useD3 } from '../../hooks/useD3'
import './SourceTypeDonut.css'

interface SourceTypeData {
  type: string
  count: number
}

interface Props {
  data: SourceTypeData[]
  width?: number
  height?: number
}

export const SourceTypeDonut: React.FC<Props> = ({ 
  data, 
  width = 400, 
  height = 400 
}) => {
  const ref = useD3((svg) => {
    // Clear previous render
    svg.selectAll('*').remove()

    if (data.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No source data available')
      return
    }

    const radius = Math.min(width, height) / 2 - 40
    const innerRadius = radius * 0.6

    // Create color scale
    const colorScale = d3.scaleOrdinal<string>()
      .domain(['web', 'papers', 'news'])
      .range(['#3b82f6', '#10b981', '#f59e0b'])

    // Create pie generator
    const pie = d3.pie<SourceTypeData>()
      .value(d => d.count)
      .sort(null)

    // Create arc generator
    const arc = d3.arc<d3.PieArcDatum<SourceTypeData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)

    // Create label arc
    const labelArc = d3.arc<d3.PieArcDatum<SourceTypeData>>()
      .innerRadius(radius + 20)
      .outerRadius(radius + 20)

    // Center the chart
    const g = svg.append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)

    // Create tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'd3-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('z-index', '1000')

    // Calculate total
    const total = d3.sum(data, d => d.count)

    // Create arcs
    const arcs = g.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc')

    // Add paths
    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => colorScale(d.data.type) || '#999')
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('opacity', 0.8)
          .attr('transform', 'scale(1.05)')
        
        const percentage = ((d.data.count / total) * 100).toFixed(1)
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9)
        tooltip.html(`
          <div><strong>${d.data.type.toUpperCase()}</strong></div>
          <div>Count: ${d.data.count}</div>
          <div>Percentage: ${percentage}%</div>
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('opacity', 1)
          .attr('transform', 'scale(1)')
        tooltip.transition()
          .duration(200)
          .style('opacity', 0)
      })

    // Add labels
    arcs.append('text')
      .attr('transform', d => {
        const [x, y] = labelArc.centroid(d)
        return `translate(${x},${y})`
      })
      .attr('text-anchor', d => {
        const centroid = labelArc.centroid(d)
        return centroid[0] > 0 ? 'start' : 'end'
      })
      .attr('fill', '#374151')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .text(d => {
        const percentage = ((d.data.count / total) * 100).toFixed(0)
        return `${d.data.type}: ${percentage}%`
      })

    // Add center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-10')
      .attr('fill', '#1f2937')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .text(total.toString())

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '15')
      .attr('fill', '#6b7280')
      .style('font-size', '14px')
      .text('Total Sources')

    // Cleanup tooltip on unmount
    return () => {
      tooltip.remove()
    }
  }, [data, width, height])

  return (
    <div className="source-type-donut">
      <h3 className="chart-title">Source Type Distribution</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}

