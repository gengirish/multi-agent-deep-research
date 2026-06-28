"use client";

import React from 'react'
import * as d3 from 'd3'
import { useD3, useResponsiveWidth } from '../../hooks/useD3'
import { CHART, colorForType, createTooltip } from './chartTheme'
import './SourceTypeDonut.css'

interface SourceTypeData {
  type: string
  count: number
}

interface Props {
  data: SourceTypeData[]
  height?: number
}

export const SourceTypeDonut: React.FC<Props> = ({ data, height = 360 }) => {
  const [containerRef, width] = useResponsiveWidth(400)

  const ref = useD3((svg) => {
    svg.selectAll('*').remove()

    if (data.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', CHART.muted)
        .style('font-size', '13px')
        .text('No source data available')
      return
    }

    const radius = Math.min(width, height) / 2 - 56
    const innerRadius = radius * 0.62

    const pie = d3.pie<SourceTypeData>().value(d => d.count).sort(null)
    const arc = d3.arc<d3.PieArcDatum<SourceTypeData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .cornerRadius(4)
      .padAngle(0.02)

    const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`)
    const tooltip = createTooltip()
    const total = d3.sum(data, d => d.count)

    const arcs = g.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc')

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => colorForType(d.data.type, d.index))
      .attr('stroke', 'rgba(11, 18, 32, 0.9)')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1)
        const percentage = ((d.data.count / total) * 100).toFixed(1)
        tooltip.transition().duration(150).style('opacity', '1')
        tooltip.html(`
          <div style="text-transform:capitalize;"><strong>${d.data.type}</strong></div>
          <div style="color:#94a3b8;margin-top:2px;">${d.data.count} sources · ${percentage}%</div>
        `)
          .style('left', (event.pageX + 12) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mousemove', function (event) {
        tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.9)
        tooltip.transition().duration(150).style('opacity', '0')
      })

    // Center total
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-2')
      .attr('fill', CHART.label)
      .style('font-size', '28px')
      .style('font-weight', '800')
      .text(total.toString())

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '20')
      .attr('fill', CHART.axis)
      .style('font-size', '12px')
      .style('letter-spacing', '0.04em')
      .text('Total sources')

    // Legend below the donut
    const legend = svg.append('g')
      .attr('transform', `translate(${width / 2 - (data.length * 80) / 2}, ${height - 16})`)
    data.forEach((d, i) => {
      const row = legend.append('g').attr('transform', `translate(${i * 80}, 0)`)
      row.append('circle').attr('r', 5).attr('cx', 5).attr('fill', colorForType(d.type, i))
      row.append('text')
        .attr('x', 16)
        .attr('y', 4)
        .attr('fill', CHART.axis)
        .style('font-size', '11px')
        .style('text-transform', 'capitalize')
        .text(d.type)
    })
  }, [data, width, height])

  return (
    <div className="source-type-donut" ref={containerRef}>
      <h3 className="chart-title">Source Type Distribution</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}
