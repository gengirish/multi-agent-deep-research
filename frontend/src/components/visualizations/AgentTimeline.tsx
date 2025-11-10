import React from 'react'
import * as d3 from 'd3'
import { useD3 } from '../../hooks/useD3'
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
  width?: number
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

export const AgentTimeline: React.FC<Props> = ({ 
  conversation, 
  width = 800, 
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
    const agentActions: ProcessedAction[] = []
    const agentEntries = conversation.filter(entry => entry.agent && entry.timestamp)
    
    agentEntries.forEach((entry, i) => {
      const startTime = new Date(entry.timestamp)
      const nextEntry = conversation.find((e, idx) => 
        idx > i && e.timestamp && new Date(e.timestamp) > startTime
      )
      
      const endTime = nextEntry 
        ? new Date(nextEntry.timestamp)
        : new Date(startTime.getTime() + 1000) // Default 1s if no next
      
      agentActions.push({
        agent: entry.agent!,
        action: entry.action || 'unknown',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        input: entry.input,
        output: entry.output
      })
    })

    if (agentActions.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No agent actions found')
      return
    }

    // Set up margins
    const margin = { top: 20, right: 30, bottom: 60, left: 120 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Get unique agents
    const agents = Array.from(new Set(agentActions.map(a => a.agent))).sort()

    // Create scales
    const timeExtent = d3.extent(agentActions, d => d.startTime) as [Date, Date]
    const maxTime = d3.max(agentActions, d => d.endTime) as Date
    timeExtent[1] = maxTime

    const xScale = d3.scaleTime()
      .domain(timeExtent)
      .range([0, innerWidth])
      .nice()

    const yScale = d3.scaleBand()
      .domain(agents)
      .range([0, innerHeight])
      .padding(0.3)

    // Color scale for agents
    const colorScale = d3.scaleOrdinal<string>()
      .domain(agents)
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
      .style('max-width', '300px')

    // Add bars (timeline)
    g.selectAll('rect')
      .data(agentActions)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.startTime))
      .attr('y', d => yScale(d.agent)!)
      .attr('width', d => Math.max(2, xScale(d.endTime) - xScale(d.startTime)))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.agent))
      .attr('opacity', 0.7)
      .attr('rx', 4)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1)
        
        const duration = (d.duration / 1000).toFixed(2)
        const startStr = d.startTime.toLocaleTimeString()
        const endStr = d.endTime.toLocaleTimeString()
        
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.95)
        
        let tooltipContent = `
          <div><strong>${d.agent}</strong> - ${d.action}</div>
          <div style="margin-top: 4px; font-size: 11px; color: #ccc;">
            Start: ${startStr}<br/>
            End: ${endStr}<br/>
            Duration: ${duration}s
          </div>
        `
        
        if (d.output) {
          const outputStr = JSON.stringify(d.output, null, 2).substring(0, 200)
          tooltipContent += `<div style="margin-top: 6px; font-size: 10px; color: #93c5fd;">Output: ${outputStr}${outputStr.length >= 200 ? '...' : ''}</div>`
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

    // Add x-axis (time)
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(8))

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 45)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Time')

    // Add y-axis (agents)
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale))

    yAxis.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -100)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Agents')

    // Add legend
    const legend = g.append('g')
      .attr('transform', `translate(${innerWidth - 150}, 10)`)

    agents.forEach((agent, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`)

      legendRow.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', colorScale(agent))
        .attr('rx', 2)

      legendRow.append('text')
        .attr('x', 16)
        .attr('y', 9)
        .attr('fill', '#374151')
        .style('font-size', '11px')
        .text(agent.charAt(0).toUpperCase() + agent.slice(1))
    })

  }, [conversation, width, height])

  return (
    <div className="agent-timeline">
      <h3 className="chart-title">Agent Timeline</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}

