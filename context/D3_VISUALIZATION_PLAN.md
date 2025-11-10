# D3.js Advanced Visualizations Implementation Plan

## 📊 Available Data for Visualization

Based on the current research workflow, we have rich data that can be visualized:

### 1. **Source Data**
- **Source Types**: Web, Papers, News
- **Domain Scores**: 0.0 - 1.0 (quality metric)
- **Credibility Scores**: 0.0 - 1.0 (from credibility agent)
- **Sentiment**: Positive, Neutral, Negative (with scores)
- **Categories**: Research, News, Technical, Blog, General
- **Metadata**: URLs, titles, snippets

### 2. **Analysis Data**
- **Contradictions**: List of conflicting information
- **Key Claims**: Important statements extracted
- **Summary Points**: Bullet points of findings

### 3. **Credibility Data**
- **Per-source credibility**: Individual scores for each source
- **Overall credibility**: Average score, distribution
- **Credibility by type**: Web vs Papers vs News

### 4. **Insights Data**
- **Trends**: Identified patterns
- **Hypotheses**: Generated hypotheses
- **Reasoning Chains**: Logical connections

---

## 🎨 Proposed D3.js Visualizations

### 1. **Credibility Score Distribution** (Histogram/Bar Chart)
- **Purpose**: Show distribution of credibility scores across all sources
- **Data**: Credibility scores from `credibility.web`, `credibility.papers`, `credibility.news`
- **Chart Type**: Histogram with bins (0-0.25, 0.25-0.5, 0.5-0.75, 0.75-1.0)
- **Interactivity**: Hover to see source count, click to filter sources

### 2. **Source Type Comparison** (Donut/Pie Chart)
- **Purpose**: Visual breakdown of source types (Web, Papers, News)
- **Data**: Count of sources by type
- **Chart Type**: Donut chart with percentages
- **Interactivity**: Click segments to filter by source type

### 3. **Credibility vs Domain Score** (Scatter Plot)
- **Purpose**: Compare credibility scores vs domain authority scores
- **Data**: Each source's credibility score and domain score
- **Chart Type**: Scatter plot with color coding by source type
- **Interactivity**: Hover for source details, click to open source

### 4. **Sentiment Distribution** (Pie Chart with D3)
- **Purpose**: Advanced sentiment visualization (upgrade from current CSS bars)
- **Data**: Sentiment counts (positive, neutral, negative)
- **Chart Type**: Animated pie chart
- **Interactivity**: Hover for counts, click to filter by sentiment

### 5. **Category Heatmap** (Heatmap)
- **Purpose**: Show category distribution with intensity
- **Data**: Category counts
- **Chart Type**: Heatmap grid
- **Interactivity**: Hover for details, click to filter

### 6. **Credibility Timeline** (Line Chart)
- **Purpose**: If dates are available, show credibility trends over time
- **Data**: Sources with dates and credibility scores
- **Chart Type**: Multi-line chart (one line per source type)
- **Interactivity**: Toggle source types, zoom, pan

### 7. **Contradiction Network** (Force-Directed Graph)
- **Purpose**: Visualize relationships between contradictory sources
- **Data**: Contradictions from analysis
- **Chart Type**: Force-directed graph with nodes (sources) and edges (contradictions)
- **Interactivity**: Drag nodes, hover for details, click to highlight connections

### 8. **Source Quality Matrix** (Bubble Chart)
- **Purpose**: Multi-dimensional view of source quality
- **Data**: Domain score (x-axis), Credibility score (y-axis), Size = relevance
- **Chart Type**: Bubble chart with color by type
- **Interactivity**: Hover for details, filter by type

---

## 🛠️ Implementation Steps

### Step 1: Install D3.js and TypeScript Types

```bash
cd frontend
npm install d3 @types/d3
```

### Step 2: Create D3 Visualization Components

Create new components in `frontend/src/components/visualizations/`:

1. `CredibilityHistogram.tsx` - Histogram chart
2. `SourceTypeDonut.tsx` - Donut chart
3. `CredibilityScatter.tsx` - Scatter plot
4. `SentimentPie.tsx` - Pie chart
5. `CategoryHeatmap.tsx` - Heatmap
6. `ContradictionNetwork.tsx` - Force-directed graph
7. `QualityBubble.tsx` - Bubble chart

### Step 3: Create Reusable D3 Hook

Create `frontend/src/hooks/useD3.ts` for D3 lifecycle management:

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export const useD3 = (renderFn: (svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void, dependencies: any[]) => {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (ref.current) {
      const svg = d3.select(ref.current)
      svg.selectAll('*').remove() // Clear previous render
      renderFn(svg)
    }
  }, dependencies)

  return ref
}
```

### Step 4: Update ResearchMetrics Component

Integrate D3 visualizations into the existing `ResearchMetrics` component, replacing or enhancing current CSS-based charts.

### Step 5: Add Visualization Toggle

Add a toggle in the UI to switch between simple (CSS) and advanced (D3) visualizations.

---

## 📝 Example Implementation: Credibility Histogram

Here's a complete example of one visualization:

```typescript
// frontend/src/components/visualizations/CredibilityHistogram.tsx
import React from 'react'
import * as d3 from 'd3'
import { useD3 } from '../../hooks/useD3'
import './CredibilityHistogram.css'

interface Props {
  credibilityData: Array<{ score: number; type: string; title: string }>
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

    // Set up margins
    const margin = { top: 20, right: 30, bottom: 40, left: 40 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, 1])
      .range([0, innerWidth])
      .nice()

    const bins = d3.bin()
      .domain(xScale.domain() as [number, number])
      .thresholds(xScale.ticks(20))
      .value(d => d.score)

    const binData = bins(credibilityData)

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(binData, d => d.length) || 0])
      .range([innerHeight, 0])
      .nice()

    // Create color scale by source type
    const colorScale = d3.scaleOrdinal()
      .domain(['web', 'papers', 'news'])
      .range(['#3b82f6', '#10b981', '#f59e0b'])

    // Create group for chart
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Add bars
    g.selectAll('rect')
      .data(binData)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.x0 || 0))
      .attr('width', d => xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1)
      .attr('y', d => yScale(d.length))
      .attr('height', d => innerHeight - yScale(d.length))
      .attr('fill', '#3b82f6')
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1)
        // Show tooltip
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.7)
      })

    // Add x-axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 35)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .text('Credibility Score')

    // Add y-axis
    g.append('g')
      .call(d3.axisLeft(yScale))
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -30)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .text('Number of Sources')
  }, [credibilityData, width, height])

  return (
    <div className="credibility-histogram">
      <h3>Credibility Score Distribution</h3>
      <svg ref={ref} width={width} height={height} />
    </div>
  )
}
```

---

## 🎯 Priority Implementation Order

1. **High Priority** (Most valuable):
   - Credibility Histogram
   - Source Type Donut Chart
   - Credibility vs Domain Score Scatter Plot

2. **Medium Priority** (Nice to have):
   - Sentiment Pie Chart (upgrade from CSS)
   - Category Heatmap
   - Quality Bubble Chart

3. **Low Priority** (Advanced features):
   - Contradiction Network Graph
   - Credibility Timeline (if dates available)

---

## 📦 File Structure

```
frontend/src/
├── components/
│   ├── visualizations/
│   │   ├── CredibilityHistogram.tsx
│   │   ├── SourceTypeDonut.tsx
│   │   ├── CredibilityScatter.tsx
│   │   ├── SentimentPie.tsx
│   │   ├── CategoryHeatmap.tsx
│   │   ├── ContradictionNetwork.tsx
│   │   ├── QualityBubble.tsx
│   │   └── index.ts
│   └── ResearchMetrics.tsx (updated)
├── hooks/
│   └── useD3.ts
└── styles/
    └── visualizations.css
```

---

## ✅ Success Criteria

- [ ] D3.js installed and configured
- [ ] At least 3 high-priority visualizations implemented
- [ ] Visualizations are responsive and accessible
- [ ] Interactive features (hover, click, filter) working
- [ ] Visualizations integrate seamlessly with existing UI
- [ ] Performance optimized (no lag with large datasets)
- [ ] Mobile-friendly (responsive design)

---

## 🚀 Quick Start

1. Install dependencies: `npm install d3 @types/d3`
2. Create `useD3` hook
3. Implement first visualization (Credibility Histogram)
4. Test with real data
5. Iterate and add more visualizations

---

## 📚 Resources

- [D3.js Documentation](https://d3js.org/)
- [D3.js Gallery](https://observablehq.com/@d3/gallery)
- [React + D3.js Tutorial](https://wattenberger.com/blog/react-and-d3)
- [TypeScript + D3.js](https://github.com/tomwanzek/d3-v4-definitelytyped)

