"use client";

import React from 'react'
import * as d3 from 'd3'
import { useD3, useResponsiveWidth } from '../../hooks/useD3'
import { CHART, createTooltip, styleAxis } from './chartTheme'
import './AgentPerformance.css'

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

interface AgentStats {
  agent: string
  actionCount: number
  totalDuration: number
  avgDuration: number
  hasErrors: boolean
  outputMetrics: Record<string, number>
}

export const AgentPerformance: React.FC<Props> = ({ conversation, height = 360 }) => {
  const [containerRef, width] = useResponsiveWidth(700)

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

    const agentEntries = conversation.filter(entry => entry.agent && entry.timestamp)
    const agentStatsMap = new Map<string, AgentStats>()

    agentEntries.forEach((entry, i) => {
      const agent = entry.agent!
      const startTime = new Date(entry.timestamp)
      const nextEntry = conversation.find((e, idx) =>
        idx > i && e.timestamp && new Date(e.timestamp) > startTime
      )
      const endTime = nextEntry
        ? new Date(nextEntry.timestamp)
        : new Date(startTime.getTime() + 1000)
      const duration = endTime.getTime() - startTime.getTime()

      if (!agentStatsMap.has(agent)) {
        agentStatsMap.set(agent, {
          agent,
          actionCount: 0,
          totalDuration: 0,
          avgDuration: 0,
          hasErrors: false,
          outputMetrics: {},
        })
      }

      const stats = agentStatsMap.get(agent)!
      stats.actionCount++
      stats.totalDuration += duration
      if (entry.type === 'error') stats.hasErrors = true

      if (entry.output) {
        Object.entries(entry.output).forEach(([key, value]) => {
          if (typeof value === 'number') {
            stats.outputMetrics[key] = (stats.outputMetrics[key] || 0) + value
          }
        })
      }
    })

    agentStatsMap.forEach(stats => {
      stats.avgDuration = stats.totalDuration / stats.actionCount
    })

    const agentStats = Array.from(agentStatsMap.values())
    if (agentStats.length === 0) {
      empty('No agent statistics available')
      return
    }

    const margin = { top: 16, right: 56, bottom: 52, left: 100 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const maxDuration = d3.max(agentStats, d => d.avgDuration) || 0
    const xScale = d3.scaleLinear().domain([0, maxDuration]).range([0, innerWidth]).nice()
    const yScale = d3.scaleBand().domain(agentStats.map(d => d.agent)).range([0, innerHeight]).padding(0.25)

    const colorScale = d3.scaleOrdinal<string>()
      .domain(agentStats.map(d => d.agent))
      .range(CHART.categorical)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const tooltip = createTooltip()

    // Vertical grid
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(6).tickSize(-innerHeight).tickFormat(() => ''))
      .call((sel) => sel.selectAll('line').attr('stroke', CHART.grid))
      .call((sel) => sel.select('.domain').remove())

    g.selectAll('rect.bar')
      .data(agentStats)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', d => yScale(d.agent)!)
      .attr('width', d => xScale(d.avgDuration))
      .attr('height', yScale.bandwidth())
      .attr('rx', 5)
      .attr('fill', d => (d.hasErrors ? CHART.error : colorScale(d.agent)))
      .attr('opacity', 0.85)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 1)
        const avgDuration = (d.avgDuration / 1000).toFixed(2)
        const totalDuration = (d.totalDuration / 1000).toFixed(2)
        const status = d.hasErrors
          ? '<span style="color:#fca5a5;">Has errors</span>'
          : '<span style="color:#86efac;">Success</span>'
        tooltip.transition().duration(150).style('opacity', '1')
        tooltip.html(`
          <div style="text-transform:capitalize;"><strong>${d.agent}</strong></div>
          <div style="margin-top:6px;font-size:11px;color:#94a3b8;">
            Actions: ${d.actionCount}<br/>
            Avg duration: ${avgDuration}s<br/>
            Total duration: ${totalDuration}s<br/>
            Status: ${status}
          </div>
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

    g.selectAll('text.value-label')
      .data(agentStats)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('x', d => xScale(d.avgDuration) + 8)
      .attr('y', d => yScale(d.agent)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', CHART.axisStrong)
      .style('font-size', '11px')
      .text(d => `${(d.avgDuration / 1000).toFixed(1)}s`)

    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d => `${((d as number) / 1000).toFixed(1)}s`))
    styleAxis(xAxis)

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 40)
      .attr('fill', CHART.axisStrong)
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Average duration')

    const yAxis = g.append('g').call(d3.axisLeft(yScale))
    styleAxis(yAxis, { hideDomain: true })
    yAxis.selectAll('text').style('text-transform', 'capitalize')
  }, [conversation, width, height])

  return (
    <div className="agent-performance" ref={containerRef}>
      <h3 className="chart-title">Agent Performance Metrics</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}
