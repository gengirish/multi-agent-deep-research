"use client";

import React from 'react'
import * as d3 from 'd3'
import { useD3, useResponsiveWidth } from '../../hooks/useD3'
import { CHART, colorForType, createTooltip, styleAxis } from './chartTheme'
import './CredibilityScatter.css'

interface ScatterDataPoint {
  credibility: number
  domainScore: number
  type: string
  title: string
  url?: string
}

interface Props {
  data: ScatterDataPoint[]
  height?: number
}

export const CredibilityScatter: React.FC<Props> = ({ data, height = 360 }) => {
  const [containerRef, width] = useResponsiveWidth(600)

  const ref = useD3((svg) => {
    svg.selectAll('*').remove()

    if (data.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', CHART.muted)
        .style('font-size', '13px')
        .text('No data available')
      return
    }

    const margin = { top: 16, right: 24, bottom: 52, left: 52 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const xScale = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]).nice()
    const yScale = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]).nice()

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const tooltip = createTooltip()

    // Grid
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8).tickSize(-innerHeight).tickFormat(() => ''))
      .call((sel) => sel.selectAll('line').attr('stroke', CHART.grid))
      .call((sel) => sel.select('.domain').remove())

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(8).tickSize(-innerWidth).tickFormat(() => ''))
      .call((sel) => sel.selectAll('line').attr('stroke', CHART.grid))
      .call((sel) => sel.select('.domain').remove())

    g.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.domainScore))
      .attr('cy', d => yScale(d.credibility))
      .attr('r', 6)
      .attr('fill', d => colorForType(d.type))
      .attr('opacity', 0.8)
      .attr('stroke', 'rgba(15, 23, 42, 0.8)')
      .attr('stroke-width', 1.5)
      .style('cursor', d => (d.url ? 'pointer' : 'default'))
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1).attr('r', 8)
        tooltip.transition().duration(150).style('opacity', '1')
        tooltip.html(`
          <div><strong>${d.title}</strong></div>
          <div style="color:#94a3b8;margin-top:2px;text-transform:capitalize;">${d.type}</div>
          <div style="margin-top:4px;">Credibility: ${d.credibility.toFixed(2)}</div>
          <div>Domain score: ${d.domainScore.toFixed(2)}</div>
          ${d.url ? `<div style="margin-top:4px;font-size:10px;color:#7dd3fc;">${d.url}</div>` : ''}
        `)
          .style('left', (event.pageX + 12) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mousemove', function (event) {
        tooltip.style('left', (event.pageX + 12) + 'px').style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 0.8).attr('r', 6)
        tooltip.transition().duration(150).style('opacity', '0')
      })
      .on('click', function (_event, d) {
        if (d.url) window.open(d.url, '_blank')
      })

    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8))
    styleAxis(xAxis)

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 42)
      .attr('fill', CHART.axisStrong)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Domain score')

    const yAxis = g.append('g').call(d3.axisLeft(yScale).ticks(8))
    styleAxis(yAxis, { hideDomain: true })

    yAxis.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -innerHeight / 2)
      .attr('fill', CHART.axisStrong)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Credibility score')

    // Legend
    const types = Array.from(new Set(data.map(d => d.type)))
    const legend = g.append('g').attr('transform', `translate(${innerWidth - 96}, 4)`)
    types.forEach((type, i) => {
      const row = legend.append('g').attr('transform', `translate(0, ${i * 18})`)
      row.append('circle').attr('r', 5).attr('cx', 5).attr('fill', colorForType(type))
      row.append('text')
        .attr('x', 16)
        .attr('y', 4)
        .attr('fill', CHART.axis)
        .style('font-size', '11px')
        .style('text-transform', 'capitalize')
        .text(type)
    })
  }, [data, width, height])

  return (
    <div className="credibility-scatter" ref={containerRef}>
      <h3 className="chart-title">Credibility vs Domain Score</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}
