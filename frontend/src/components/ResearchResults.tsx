import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ResearchData } from '../App'
import './ResearchResults.css'

interface Props {
  data: ResearchData
}

// Result Card Component
interface ResultCardProps {
  title: string
  icon: string
  count: number
  isExpanded: boolean
  onToggle: () => void
  color: 'blue' | 'green' | 'purple'
  children: React.ReactNode
}

const ResultCard: React.FC<ResultCardProps> = ({
  title,
  icon,
  count,
  isExpanded,
  onToggle,
  color,
  children,
}) => {
  return (
    <div className={`result-card ${color}`} role="region" aria-label={title}>
      <div 
        className="card-header" 
        onClick={onToggle} 
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        role="button" 
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="card-title-section">
          <span className="card-icon">{icon}</span>
          <div>
            <h3>{title}</h3>
            <span className="card-count">{count} item(s)</span>
          </div>
        </div>
        <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </div>

      {isExpanded && <div className="card-content">{children}</div>}
    </div>
  )
}

const downloadReport = (content: string) => {
  const element = document.createElement('a')
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  element.setAttribute('href', url)
  const timestamp = new Date().toISOString().split('T')[0]
  element.setAttribute('download', `research_report_${timestamp}.md`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
  URL.revokeObjectURL(url)
}

export const ResearchResults: React.FC<Props> = ({ data }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    sources: true,
    analysis: true,
    insights: true,
    report: true,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  if (data.status === 'error') {
    return (
      <section className="results-error" role="alert">
        <div className="error-icon">⚠️</div>
        <h2>Research Failed</h2>
        <p className="error-message">{data.report || data.error || 'An unknown error occurred'}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </section>
    )
  }

  // Calculate counts
  const sourcesCount = Object.values(data.sources || {}).reduce(
    (acc, sources) => acc + (Array.isArray(sources) ? sources.length : 0),
    0
  )
  
  const analysisCount = data.analysis 
    ? Object.keys(data.analysis).reduce((acc, key) => {
        const value = data.analysis[key]
        return acc + (Array.isArray(value) ? value.length : value ? 1 : 0)
      }, 0)
    : 0
  
  const insightCount = data.insights?.insights?.length || 0

  // Get sources list
  const sourcesList: Array<{ title: string; url: string; snippet?: string }> = []
  if (data.sources) {
    Object.values(data.sources).forEach((sourceArray) => {
      if (Array.isArray(sourceArray)) {
        sourceArray.forEach((source: any) => {
          if (source && (source.url || source.title)) {
            sourcesList.push({
              title: source.title || 'Untitled',
              url: source.url || '',
              snippet: source.snippet || source.summary || '',
            })
          }
        })
      }
    })
  }

  // Get analysis items
  const analysisItems: Array<{ key: string; value: string }> = []
  if (data.analysis) {
    Object.entries(data.analysis).forEach(([key, value]) => {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            analysisItems.push({ key, value: String(item) })
          })
        } else {
          analysisItems.push({ key, value: String(value) })
        }
      }
    })
  }

  // Get insights list
  const insightsList = data.insights?.insights || []

  return (
    <section className="results-container" role="region" aria-label="Research results">
      {/* Floating Stats Bar */}
      <div className="stats-bar" role="complementary" aria-label="Research statistics">
        <div className="stat-item">
          <div className="stat-number">{sourcesCount}</div>
          <div className="stat-label">📚 Sources</div>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <div className="stat-number">{analysisCount}</div>
          <div className="stat-label">🔍 Findings</div>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <div className="stat-number">{insightCount}</div>
          <div className="stat-label">💡 Insights</div>
        </div>
      </div>

      {/* Results grid */}
      <div className="results-grid">
        {/* Sources Card */}
        <ResultCard
          title="📚 Sources Retrieved"
          icon="📚"
          count={sourcesCount}
          isExpanded={expandedSections.sources}
          onToggle={() => toggleSection('sources')}
          color="blue"
        >
          <div className="sources-list">
            {sourcesList.length > 0 ? (
              sourcesList.map((source, idx) => (
                <div key={idx} className="source-item">
                  <div className="source-badge">{idx + 1}</div>
                  <div className="source-content">
                    <p className="source-title">{source.title}</p>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
                      >
                        {source.url}
                      </a>
                    )}
                    {source.snippet && (
                      <p className="source-snippet">{source.snippet.substring(0, 150)}...</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="no-content">No sources retrieved</p>
            )}
          </div>
        </ResultCard>

        {/* Analysis Card */}
        <ResultCard
          title="📊 Analysis Findings"
          icon="📊"
          count={analysisCount}
          isExpanded={expandedSections.analysis}
          onToggle={() => toggleSection('analysis')}
          color="green"
        >
          <div className="analysis-list">
            {analysisItems.length > 0 ? (
              analysisItems.map((item, idx) => (
                <div key={idx} className="analysis-item">
                  <div className="analysis-label">{item.key}</div>
                  <p className="analysis-content">{item.value}</p>
                </div>
              ))
            ) : (
              <p className="no-content">No analysis available</p>
            )}
          </div>
        </ResultCard>

        {/* Insights Card */}
        <ResultCard
          title="💡 Emerging Trends"
          icon="💡"
          count={insightCount}
          isExpanded={expandedSections.insights}
          onToggle={() => toggleSection('insights')}
          color="purple"
        >
          <div className="insights-list">
            {insightsList.length > 0 ? (
              insightsList.map((insight, idx) => (
                <div key={idx} className="insight-item">
                  <div className="insight-number">{idx + 1}</div>
                  <p className="insight-text">{String(insight)}</p>
                </div>
              ))
            ) : (
              <p className="no-content">No insights generated</p>
            )}
          </div>
        </ResultCard>
      </div>

      {/* Full Report Section */}
      <div className="report-section">
        <div className="report-header">
          <div>
            <h2>📄 Full Research Report</h2>
            <p className="report-subtitle">Comprehensive analysis compiled by AI agents</p>
          </div>
          <button
            onClick={() => downloadReport(data.report || '')}
            className="download-button"
            aria-label="Download report as markdown file"
          >
            <span className="download-icon">📥</span>
            <span className="download-text">Download</span>
          </button>
        </div>

        <div className="report-content">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            className="markdown-content"
          >
            {data.report || 'No report generated'}
          </ReactMarkdown>
        </div>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="action-button secondary"
        >
          ↑ New Research
        </button>
        <button
          onClick={() => downloadReport(data.report || '')}
          className="action-button primary"
        >
          📥 Download Report
        </button>
      </div>
    </section>
  )
}
