"use client";

import React from 'react'
import * as d3 from 'd3'
import { useD3, useResponsiveWidth } from '../../hooks/useD3'
import { CHART, createTooltip, styleAxis } from './chartTheme'
import './AgentTimeline.css'

interface ConversationEntry {
  timestamp: string
  agent?: string
  action?: string
  type?: string
  input?: any
  output?: any
  metadata?: any
}

interface Props {
  conversation: ConversationEntry[]
  height?: number
}

interface ProcessedAction {
  agent: string
  action: string
  startTime: Date
  endTime: Date
  duration: number
  input?: any
  output?: any
}

export const AgentTimeline: React.FC<Props> = ({ conversation, height = 360 }) => {
  const [containerRef, width] = useResponsiveWidth(800)

  const ref = useD3((svg) => {
    svg.selectAll('*').remove()

    const empty = (msg: string) => {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', CHART.muted)
        .style('font-size', '13px')
        .text(msg)
    }

    if (!conversation || conversation.length === 0) {
      empty('No conversation data available')
      return
    }

    const agentActions: ProcessedAction[] = []
    const agentEntries = conversation.filter(entry => entry.agent && entry.timestamp)

    agentEntries.forEach((entry, i) => {
      const startTime = new Date(entry.timestamp)
      const nextEntry = conversation.find((e, idx) =>
        idx > i && e.timestamp && new Date(e.timestamp) > startTime
      )
      const endTime = nextEntry
        ? new Date(nextEntry.timestamp)
        : new Date(startTime.getTime() + 1000)

      agentActions.push({
        agent: entry.agent!,
        action: entry.action || 'unknown',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        input: entry.input,
        output: entry.output,
      })
    })

    if (agentActions.length === 0) {
      empty('No agent actions found')
      return
    }

    const margin = { top: 16, right: 24, bottom: 48, left: 110 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const agents = Array.from(new Set(agentActions.map(a => a.agent))).sort()

    const timeExtent = d3.extent(agentActions, d => d.startTime) as [Date, Date]
    timeExtent[1] = d3.max(agentActions, d => d.endTime) as Date

    const xScale = d3.scaleTime().domain(timeExtent).range([0, innerWidth]).nice()
    const yScale = d3.scaleBand().domain(agents).range([0, innerHeight]).padding(0.35)

    const colorScale = d3.scaleOrdinal<string>()
      .domain(agents)
      .range(CHART.categorical)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const tooltip = createTooltip()

    // Vertical grid
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8).tickSize(-innerHeight).tickFormat(() => ''))
      .call((sel) => sel.selectAll('line').attr('stroke', CHART.grid))
      .call((sel) => sel.select('.domain').remove())

    g.selectAll('rect.bar')
      .data(agentActions)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.startTime))
      .attr('y', d => yScale(d.agent)!)
      .attr('width', d => Math.max(3, xScale(d.endTime) - xScale(d.startTime)))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.agent))
      .attr('opacity', 0.85)
      .attr('rx', 5)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1)
        const duration = (d.duration / 1000).toFixed(2)
        tooltip.transition().duration(150).style('opacity', '1')
        let content = `
          <div style="text-transform:capitalize;"><strong>${d.agent}</strong> · ${d.action}</div>
          <div style="margin-top:4px;font-size:11px;color:#94a3b8;">
            ${d.startTime.toLocaleTimeString()} → ${d.endTime.toLocaleTimeString()}<br/>
            Duration: ${duration}s
          </div>`
        if (d.output) {
          const outputStr = JSON.stringify(d.output, null, 2).substring(0, 180)
          content += `<div style="margin-top:6px;font-size:10px;color:#7dd3fc;">${outputStr}${outputStr.length >= 180 ? '…' : ''}</div>`
        }
        tooltip.html(content)
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
      .attr('y', 40)
      .attr('fill', CHART.axisStrong)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Time')

    const yAxis = g.append('g').call(d3.axisLeft(yScale))
    styleAxis(yAxis, { hideDomain: true })
    yAxis.selectAll('text').style('text-transform', 'capitalize')
  }, [conversation, width, height])

  return (
    <div className="agent-timeline" ref={containerRef}>
      <h3 className="chart-title">Agent Timeline</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}
