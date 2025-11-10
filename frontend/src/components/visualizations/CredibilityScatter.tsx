import React from 'react'
import * as d3 from 'd3'
import { useD3 } from '../../hooks/useD3'
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
  width?: number
  height?: number
}

export const CredibilityScatter: React.FC<Props> = ({ 
  data, 
  width = 600, 
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
        .text('No data available')
      return
    }

    // Set up margins
    const margin = { top: 20, right: 30, bottom: 60, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, innerWidth])
      .nice()

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0])
      .nice()

    // Create color scale by source type
    const colorScale = d3.scaleOrdinal<string>()
      .domain(['web', 'papers', 'news'])
      .range(['#3b82f6', '#10b981', '#f59e0b'])

    // Create size scale (based on relevance or count)
    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(data, d => 1) || 1])
      .range([4, 10])

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
      .style('max-width', '250px')

    // Add grid lines
    const xGrid = g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(10)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '2,2')

    const yGrid = g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .ticks(10)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '2,2')

    // Add data points
    g.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.domainScore))
      .attr('cy', d => yScale(d.credibility))
      .attr('r', d => sizeScale(1))
      .attr('fill', d => colorScale(d.type) || '#999')
      .attr('opacity', 0.7)
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('opacity', 1)
          .attr('r', sizeScale(1) + 2)
        
        tooltip.transition()
          .duration(200)
          .style('opacity', 0.9)
        tooltip.html(`
          <div><strong>${d.title}</strong></div>
          <div>Type: ${d.type}</div>
          <div>Credibility: ${d.credibility.toFixed(2)}</div>
          <div>Domain Score: ${d.domainScore.toFixed(2)}</div>
          ${d.url ? `<div style="margin-top: 4px; font-size: 10px; color: #93c5fd;">${d.url}</div>` : ''}
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
          .attr('opacity', 0.7)
          .attr('r', sizeScale(1))
        tooltip.transition()
          .duration(200)
          .style('opacity', 0)
      })
      .on('click', function(event, d) {
        if (d.url) {
          window.open(d.url, '_blank')
        }
      })
      .style('cursor', d => d.url ? 'pointer' : 'default')

    // Add x-axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).ticks(10))

    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 45)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Domain Score')

    // Add y-axis
    const yAxis = g.append('g')
      .call(d3.axisLeft(yScale).ticks(10))

    yAxis.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -45)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .text('Credibility Score')

    // Add legend
    const legend = g.append('g')
      .attr('transform', `translate(${innerWidth - 100}, 20)`)

    const types = ['web', 'papers', 'news']
    types.forEach((type, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`)

      legendRow.append('circle')
        .attr('r', 5)
        .attr('fill', colorScale(type))

      legendRow.append('text')
        .attr('x', 12)
        .attr('y', 5)
        .attr('fill', '#374151')
        .style('font-size', '11px')
        .text(type.charAt(0).toUpperCase() + type.slice(1))
    })

  }, [data, width, height])

  return (
    <div className="credibility-scatter">
      <h3 className="chart-title">Credibility vs Domain Score</h3>
      <svg ref={ref} width={width} height={height} className="d3-chart" />
    </div>
  )
}

