import React, { useState } from 'react'

interface Props {
  onSubmit: (query: string) => void
  loading: boolean
  disabled?: boolean
}

export const ResearchForm: React.FC<Props> = ({ onSubmit, loading, disabled = false }) => {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim() && !loading) {
      onSubmit(query)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="research-form" role="search" aria-label="Research query form">
      <label htmlFor="query-input" className="form-label">
        What would you like to research?
      </label>
      
      <input
        id="query-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g., Latest developments in quantum computing 2024"
        disabled={loading || disabled}
        aria-busy={loading}
        aria-describedby="query-hint"
        aria-required="true"
        className="query-input"
        autoComplete="off"
      />
      
      <p id="query-hint" className="form-hint">
        Enter your research topic. Results will appear below.
      </p>

      <button
        type="submit"
        disabled={loading || !query.trim() || disabled}
        aria-label={loading ? 'Research in progress, please wait' : 'Start research'}
        aria-busy={loading}
        className="submit-button"
      >
        {loading ? '⏳ Researching...' : '🔍 Start Research'}
      </button>
    </form>
  )
}

