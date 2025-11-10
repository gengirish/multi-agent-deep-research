# Agent Conversation Visualization Implementation Plan

## 📊 Available Data Structure

Based on the agent logger, conversation logs contain:

### Conversation Log Structure:
```json
{
  "query_id": "20251110_171636_995108",
  "conversation": [
    {
      "timestamp": "2025-11-10T17:16:36.995174",
      "type": "query",
      "content": "Latest developments in quantum computing 2024"
    },
    {
      "timestamp": "2025-11-10T17:16:36.998228",
      "agent": "retriever",
      "action": "retrieve",
      "input": {...},
      "output": {...},
      "metadata": {}
    },
    {
      "timestamp": "2025-11-10T17:17:11.779481",
      "agent": "credibility",
      "action": "evaluate_credibility",
      "input": null,
      "output": {
        "total_sources": 15,
        "average_score": 0.65
      }
    },
    {
      "timestamp": "2025-11-10T17:17:32.149093",
      "type": "final_result",
      "content": {...}
    }
  ],
  "total_entries": 14
}
```

### Key Data Points:
- **Timestamps**: Precise timing for each action
- **Agents**: retriever, enricher, credibility, analyzer, insight_generator, report_builder
- **Actions**: retrieve, enrich_sources, evaluate_credibility, analyze, generate, compile
- **Input/Output**: Data flow between agents
- **Metadata**: Additional context
- **Errors**: Error tracking

---

## 🎨 Proposed D3.js Visualizations

### 1. **Agent Timeline (Gantt Chart)**
- **Purpose**: Visualize agent actions over time
- **Data**: Timestamps and agent actions
- **Chart Type**: Horizontal bar chart (Gantt-style)
- **Features**:
  - Each agent has a row
  - Bars show action duration
  - Color-coded by agent type
  - Hover for details (timestamp, action, duration)
  - Click to see input/output data

### 2. **Agent Flow Diagram (Sankey Diagram)**
- **Purpose**: Show data flow between agents
- **Data**: Agent sequence and data flow
- **Chart Type**: Sankey diagram or flow diagram
- **Features**:
  - Nodes represent agents
  - Edges show data flow
  - Edge width = data volume
  - Interactive: hover for details, click to highlight path

### 3. **Agent Performance Metrics (Bar Chart)**
- **Purpose**: Compare agent performance
- **Data**: Duration, success rate, output metrics
- **Chart Type**: Grouped bar chart
- **Features**:
  - Duration per agent
  - Success rate (no errors)
  - Output metrics (sources found, insights generated, etc.)
  - Comparison across agents

### 4. **Agent Activity Heatmap**
- **Purpose**: Show agent activity intensity over time
- **Data**: Agent actions by time segments
- **Chart Type**: Heatmap grid
- **Features**:
  - Rows = agents
  - Columns = time segments
  - Color intensity = activity level
  - Hover for action count

### 5. **Agent Interaction Network (Force-Directed Graph)**
- **Purpose**: Visualize agent relationships and interactions
- **Data**: Agent connections and data flow
- **Chart Type**: Force-directed graph
- **Features**:
  - Nodes = agents
  - Edges = interactions
  - Node size = activity level
  - Edge thickness = data volume
  - Draggable nodes

### 6. **Agent Duration Distribution (Box Plot)**
- **Purpose**: Show duration distribution per agent
- **Data**: Action durations by agent
- **Chart Type**: Box plot or violin plot
- **Features**:
  - Median, quartiles, outliers
  - Compare agents
  - Identify slow agents

---

## 🛠️ Implementation Steps

### Step 1: Add API Endpoint for Conversation Logs

Add endpoint to `backend/main.py`:
- `GET /api/conversation/{query_id}` - Get specific conversation log
- `GET /api/conversation/latest` - Get latest conversation log
- Include conversation data in research response

### Step 2: Create D3 Visualization Components

Create components in `frontend/src/components/visualizations/`:

1. `AgentTimeline.tsx` - Gantt chart
2. `AgentFlow.tsx` - Sankey/flow diagram
3. `AgentPerformance.tsx` - Performance metrics
4. `AgentHeatmap.tsx` - Activity heatmap
5. `AgentNetwork.tsx` - Force-directed graph
6. `AgentDuration.tsx` - Duration distribution

### Step 3: Create Conversation Visualization Container

Create `frontend/src/components/AgentConversationVisualization.tsx`:
- Container component that orchestrates all visualizations
- Data processing and transformation
- Toggle between different views

### Step 4: Integrate with Research Results

- Add conversation data to ResearchData interface
- Display conversation visualizations in results view
- Add tab or section for conversation analysis

---

## 📝 Example Implementation: Agent Timeline

```typescript
// frontend/src/components/visualizations/AgentTimeline.tsx
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
}

interface Props {
  conversation: ConversationEntry[]
  width?: number
  height?: number
}

export const AgentTimeline: React.FC<Props> = ({ 
  conversation, 
  width = 800, 
  height = 400 
}) => {
  const ref = useD3((svg) => {
    // Process conversation data
    const agentActions = conversation
      .filter(entry => entry.agent && entry.timestamp)
      .map((entry, i) => {
        const startTime = new Date(entry.timestamp)
        const nextEntry = conversation[i + 1]
        const endTime = nextEntry 
          ? new Date(nextEntry.timestamp)
          : new Date(startTime.getTime() + 1000) // Default 1s if no next
        
        return {
          agent: entry.agent!,
          action: entry.action!,
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          input: entry.input,
          output: entry.output
        }
      })

    // Group by agent
    const agents = Array.from(new Set(agentActions.map(a => a.agent)))
    
    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(agentActions, d => d.startTime) as [Date, Date])
      .range([0, width - 200])

    const yScale = d3.scaleBand()
      .domain(agents)
      .range([0, height - 60])
      .padding(0.2)

    const colorScale = d3.scaleOrdinal<string>()
      .domain(agents)
      .range(d3.schemeCategory10)

    // Clear and draw
    svg.selectAll('*').remove()
    
    const g = svg.append('g')
      .attr('transform', 'translate(180, 30)')

    // Add bars
    g.selectAll('rect')
      .data(agentActions)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.startTime))
      .attr('y', d => yScale(d.agent)!)
      .attr('width', d => xScale(d.endTime) - xScale(d.startTime))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.agent))
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        // Show tooltip
      })

    // Add axes
    g.append('g')
      .attr('transform', `translate(0, ${height - 60})`)
      .call(d3.axisBottom(xScale))

    g.append('g')
      .call(d3.axisLeft(yScale))
  }, [conversation, width, height])

  return (
    <div className="agent-timeline">
      <h3>Agent Timeline</h3>
      <svg ref={ref} width={width} height={height} />
    </div>
  )
}
```

---

## 🎯 Priority Implementation Order

1. **High Priority**:
   - Agent Timeline (Gantt chart)
   - Agent Performance Metrics
   - API endpoint for conversation logs

2. **Medium Priority**:
   - Agent Flow Diagram
   - Agent Activity Heatmap

3. **Low Priority**:
   - Agent Interaction Network
   - Agent Duration Distribution

---

## 📦 File Structure

```
backend/
├── main.py (add conversation endpoints)
frontend/src/
├── components/
│   ├── visualizations/
│   │   ├── AgentTimeline.tsx
│   │   ├── AgentFlow.tsx
│   │   ├── AgentPerformance.tsx
│   │   ├── AgentHeatmap.tsx
│   │   ├── AgentNetwork.tsx
│   │   └── AgentDuration.tsx
│   └── AgentConversationVisualization.tsx
├── App.tsx (add conversation data)
```

---

## ✅ Success Criteria

- [ ] API endpoint to fetch conversation logs
- [ ] At least 2 high-priority visualizations implemented
- [ ] Conversation data included in research response
- [ ] Interactive features (hover, click, filter)
- [ ] Responsive design
- [ ] Performance optimized

