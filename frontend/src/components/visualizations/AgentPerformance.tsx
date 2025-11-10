import React from 'react'
import * as d3 from 'd3'
import { useD3 } from '../../hooks/useD3'
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
  width?: number
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

export const AgentPerformance: React.FC<Props> = ({ 
  conversation, 
  width = 700, 
  height = 400 
}) => {
  const ref = useD3((svg) => {
    svg.selectAll('*').remove()

    if (!conversation || conversation.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No conversation data available')
      return
    }

    // Process conversation data
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
          outputMetrics: {}
        })
      }

      const stats = agentStatsMap.get(agent)!
      stats.actionCount++
      stats.totalDuration += duration
      
      if (entry.type === 'error') {
        stats.hasErrors = true
      }

      // Extract output metrics
      if (entry.output) {
        Object.entries(entry.output).forEach(([key, value]) => {
          if (typeof value === 'number') {
            stats.outputMetrics[key] = (stats.outputMetrics[key] || 0) + value
          }
        })
      }
    })

    // Calculate averages
    agentStatsMap.forEach(stats => {
      stats.avgDuration = stats.totalDuration / stats.actionCount
    })

    const agentStats = Array.from(agentStatsMap.values())

    if (agentStats.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No agent statistics available')
      return
    }

    // Set up margins
    const margin = { top: 20, right: 30, bottom: 80, left: 100 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create scales
    const maxDuration = d3.max(agentStats, d => d.avgDuration) || 0
    const xScale = d3.scaleLinear()
      .domain([0, maxDuration])
      .range([0, innerWidth])
      .nice()

    const yScale = d3.scaleBand()
      .domain(agentStats.map(d => d.agent))
      .range([0, innerHeight])
      .padding(0.2)

    // Color scale
    const colorScale = d3.scaleOrdinal<string>()
      .domain(agentStats.map(d => d.agent))
      .range(['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'])

    // Create group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Create tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'd3-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '10px')
      .style('border-radius', '6px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('z-index', '1000')

    // Add bars
    g.selectAll('rect')
      .data(agentStats)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', d => yScale(d.agent)!)
      .attr('width', d => xScale(d.avgDuration))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => d.hasErrors ? '#ef4444' : colorScale(d.agent))
      .attr('opacity', 0.7)
      .attr('rx', 4)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1)
        
        const avgDuration = (d.avgDuration / 1000).toFixed(2)
        const totalDuration = (d.totalDuration / 1000).toFixed(2)
        
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.95)
        
        let tooltipContent = `
          <div><strong>${d.agent}</strong></div>
          <div style="margin-top: 6px; font-size: 11px; color: #ccc;">
            Actions: ${d.actionCount}<br/>
            Avg Duration: ${avgDuration}s<br/>
            Total Duration: ${totalDuration}s<br/>
            Status: ${d.hasErrors ? '<span style="color: #ef4444;">Has Errors</span>' : '<span style="color: #10b981;">Success</span>'}
          </div>
        `
        
        if (Object.keys(d.outputMetrics).length > 0) {
          tooltipContent += `<div style="margin-top: 6px; font-size: 10px; color: #93c5fd;">Metrics: ${JSON.stringify(d.outputMetrics)}</div>`
        }
        
        tooltip.html(tooltipContent)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px')
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.7)
        tooltip.transition()
          .duration(200)
          .style('opacity', 0)
      })

    // Add value labels
    g.selectAll('text.value-label')
      .data(agentStats)
      .enter()
      .append('text')
      .attr('class', 'value-label')
      .attr('x', d => xScale(d.avgDuration) + 5)
      .attr('y', d => yScale(d.agent)! + yScale.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#374151')
      .style('font-size', '11px')
      .text(d => `${(d.avgDuration / 1000).toFixed(1)}s`)

    // Add x-axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(d => `${(d as number / 1000).toFixed(1)}s`))

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 45)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Average Duration (seconds)')

    // Add y-axis
    g.append('g')
      .call(d3.axisLeft(yScale))

  }, [conversation, width, height])

  return (
    <div className="agent-performance">
      <h3 className="chart-title">Agent Performance Metrics</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}

