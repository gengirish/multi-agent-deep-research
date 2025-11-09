import React, { useState, useEffect } from 'react'

interface Props {
  onSubmit: (query: string) => void
  loading: boolean
  disabled?: boolean
  initialQuery?: string
  onQueryChange?: (query: string) => void
}

export const ResearchForm: React.FC<Props> = ({ 
  onSubmit, 
  loading, 
  disabled = false,
  initialQuery = '',
  onQueryChange
}) => {
  const [query, setQuery] = useState(initialQuery)

  // Update query when initialQuery changes (from sidebar demo queries)
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery)
    }
  }, [initialQuery])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (onQueryChange) {
      onQueryChange(value)
    }
  }

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
        onChange={(e) => handleQueryChange(e.target.value)}
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

