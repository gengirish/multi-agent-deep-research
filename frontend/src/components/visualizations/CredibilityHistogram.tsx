"use client";

import React from 'react'
import * as d3 from 'd3'
import { useD3, useResponsiveWidth } from '../../hooks/useD3'
import { CHART, createTooltip, styleAxis, horizontalBarGradient } from './chartTheme'
import './CredibilityHistogram.css'

interface CredibilityItem {
  score: number
  type: string
  title: string
  url?: string
}

interface Props {
  credibilityData: CredibilityItem[]
  height?: number
}

export const CredibilityHistogram: React.FC<Props> = ({
  credibilityData,
  height = 300,
}) => {
  const [containerRef, width] = useResponsiveWidth(600)

  const ref = useD3((svg) => {
    svg.selectAll('*').remove()

    if (credibilityData.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', CHART.muted)
        .style('font-size', '13px')
        .text('No credibility data available')
      return
    }

    const margin = { top: 16, right: 24, bottom: 48, left: 48 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth])

    const bins = d3.bin<CredibilityItem, number>()
      .domain([0, 1])
      .thresholds(xScale.ticks(20))
      .value(d => d.score)

    const binData = bins(credibilityData)

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(binData, d => d.length) || 0])
      .range([innerHeight, 0])
      .nice()

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const fill = horizontalBarGradient(svg, 'histogram-grad')
    const tooltip = createTooltip()

    // Horizontal grid lines
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(() => ''))
      .call((sel) => sel.selectAll('line').attr('stroke', CHART.grid))
      .call((sel) => sel.select('.domain').remove())

    g.selectAll('rect.bar')
      .data(binData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.x0 || 0))
      .attr('width', d => Math.max(0, xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1.5))
      .attr('y', d => yScale(d.length))
      .attr('height', d => innerHeight - yScale(d.length))
      .attr('rx', 3)
      .attr('fill', fill)
      .attr('opacity', 0.85)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1)
        tooltip.transition().duration(150).style('opacity', '1')
        tooltip.html(`
          <div><strong>Score range</strong> ${(d.x0 || 0).toFixed(2)} – ${(d.x1 || 0).toFixed(2)}</div>
          <div style="color:#94a3b8;margin-top:2px;">${d.length} source${d.length === 1 ? '' : 's'}</div>
        `)
          .style('left', (event.pageX + 12) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mousemove', function (event) {
        tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.85)
        tooltip.transition().duration(150).style('opacity', '0')
      })

    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8))
    styleAxis(xAxis)

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 38)
      .attr('fill', CHART.axisStrong)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Credibility score')

    const yAxis = g.append('g').call(d3.axisLeft(yScale).ticks(5))
    styleAxis(yAxis, { hideDomain: true })

    yAxis.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -36)
      .attr('x', -innerHeight / 2)
      .attr('fill', CHART.axisStrong)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Sources')
  }, [credibilityData, width, height])

  return (
    <div className="credibility-histogram" ref={containerRef}>
      <h3 className="chart-title">Credibility Score Distribution</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}
