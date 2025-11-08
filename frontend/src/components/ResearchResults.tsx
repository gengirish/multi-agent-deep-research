import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ResearchData } from '../App'

interface Props {
  data: ResearchData
}

export const ResearchResults: React.FC<Props> = ({ data }) => {
  const downloadReport = (content: string) => {
    const element = document.createElement('a')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    element.setAttribute('href', url)
    element.setAttribute('download', 'research_report.md')
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
    URL.revokeObjectURL(url)
  }

  if (data.status === 'error') {
    return (
      <section className="results" role="region" aria-label="Research results">
        <div className="error-box" role="alert" aria-live="assertive">
          <h2>Research Failed</h2>
          <p>{data.report || data.error || 'An unknown error occurred'}</p>
        </div>
      </section>
    )
  }

  const sourcesCount = Object.values(data.sources || {}).reduce(
    (acc, sources) => acc + (Array.isArray(sources) ? sources.length : 0),
    0
  )

  return (
    <section className="results" role="region" aria-label="Research results">
      <div className="results-summary" role="group" aria-label="Research summary">
        <div className="summary-card" role="region" aria-label="Sources retrieved">
          <h2>📚 Sources</h2>
          <p className="stat">{sourcesCount} sources found</p>
        </div>

        <div className="summary-card" role="region" aria-label="Analysis findings">
          <h2>📊 Analysis</h2>
          <p className="stat">
            {data.analysis?.summary?.length || 0} key findings
          </p>
        </div>

        <div className="summary-card" role="region" aria-label="Generated insights">
          <h2>💡 Insights</h2>
          <p className="stat">
            {data.insights?.insights?.length || 0} insights generated
          </p>
        </div>
      </div>

      <div className="report-section" role="region" aria-label="Full research report">
        <div className="report-header">
          <h2>📄 Full Report</h2>
          <button 
            onClick={() => downloadReport(data.report || '')}
            className="download-button"
            aria-label="Download report as markdown file"
          >
            📥 Download Report
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
    </section>
  )
}

