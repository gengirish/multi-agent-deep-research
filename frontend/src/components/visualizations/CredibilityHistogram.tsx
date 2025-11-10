import React from 'react'
import * as d3 from 'd3'
import { useD3 } from '../../hooks/useD3'
import './CredibilityHistogram.css'

interface CredibilityItem {
  score: number
  type: string
  title: string
  url?: string
}

interface Props {
  credibilityData: CredibilityItem[]
  width?: number
  height?: number
}

export const CredibilityHistogram: React.FC<Props> = ({ 
  credibilityData, 
  width = 600, 
  height = 300 
}) => {
  const ref = useD3((svg) => {
    // Clear previous render
    svg.selectAll('*').remove()

    if (credibilityData.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No credibility data available')
      return
    }

    // Set up margins
    const margin = { top: 20, right: 30, bottom: 50, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, innerWidth])

    const bins = d3.bin<CredibilityItem, number>()
      .domain([0, 1])
      .thresholds(xScale.ticks(20))
      .value(d => d.score)

    const binData = bins(credibilityData)

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(binData, d => d.length) || 0])
      .range([innerHeight, 0])
      .nice()

    // Create color scale by source type
    const colorScale = d3.scaleOrdinal<string>()
      .domain(['web', 'papers', 'news'])
      .range(['#3b82f6', '#10b981', '#f59e0b'])

    // Create group for chart
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

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

    // Add bars
    g.selectAll('rect')
      .data(binData)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.x0 || 0))
      .attr('width', d => Math.max(0, xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1))
      .attr('y', d => yScale(d.length))
      .attr('height', d => innerHeight - yScale(d.length))
      .attr('fill', '#3b82f6')
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1)
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9)
        tooltip.html(`
          <div><strong>Score Range:</strong> ${(d.x0 || 0).toFixed(2)} - ${(d.x1 || 0).toFixed(2)}</div>
          <div><strong>Sources:</strong> ${d.length}</div>
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
        d3.select(this).attr('opacity', 0.7)
        tooltip.transition()
          .duration(200)
          .style('opacity', 0)
      })

    // Add x-axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(10))

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 40)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Credibility Score')

    // Add y-axis
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale))

    yAxis.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -35)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Number of Sources')

    // Cleanup tooltip on unmount
    return () => {
      tooltip.remove()
    }
  }, [credibilityData, width, height])

  return (
    <div className="credibility-histogram">
      <h3 className="chart-title">Credibility Score Distribution</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}

