import React, { useState, useEffect } from 'react'
import { VoiceInput } from './VoiceInput'
import { PictureInput } from './PictureInput'
import './ResearchForm.css'

type InputMode = 'text' | 'voice' | 'picture'

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
  const [inputMode, setInputMode] = useState<InputMode>('text')

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

  const handleVoiceCapture = (text: string) => {
    // Update the query when voice is captured (after stop is clicked)
    handleQueryChange(text)
  }

  const handlePictureCapture = (text: string) => {
    // Update the query when picture text is extracted
    handleQueryChange(text)
  }

  const handleReset = () => {
    handleQueryChange('')
  }

  return (
    <form onSubmit={handleSubmit} className="research-form" role="search" aria-label="Research query form">
      <label htmlFor="query-input" className="form-label">
        What would you like to research?
      </label>
      
      {/* Input Mode Toggle */}
      <div className="input-mode-toggle" role="tablist" aria-label="Input method selection">
        <button
          type="button"
          className={`mode-button ${inputMode === 'text' ? 'active' : ''}`}
          onClick={() => setInputMode('text')}
          aria-pressed={inputMode === 'text'}
          aria-label="Switch to text input mode"
          disabled={loading || disabled}
        >
          <span className="mode-icon">⌨️</span>
          <span className="mode-text">Type</span>
        </button>
        <button
          type="button"
          className={`mode-button ${inputMode === 'voice' ? 'active' : ''}`}
          onClick={() => setInputMode('voice')}
          aria-pressed={inputMode === 'voice'}
          aria-label="Switch to voice input mode"
          disabled={loading || disabled}
        >
          <span className="mode-icon">🎤</span>
          <span className="mode-text">Speak</span>
        </button>
        <button
          type="button"
          className={`mode-button ${inputMode === 'picture' ? 'active' : ''}`}
          onClick={() => setInputMode('picture')}
          aria-pressed={inputMode === 'picture'}
          aria-label="Switch to picture input mode"
          disabled={loading || disabled}
        >
          <span className="mode-icon">📷</span>
          <span className="mode-text">Picture</span>
        </button>
      </div>
      
      {/* Voice Input Section */}
      {inputMode === 'voice' && (
        <div className="voice-input-container">
          <VoiceInput
            onVoiceCapture={handleVoiceCapture}
            onReset={handleReset}
            disabled={loading || disabled}
          />
          {query && (
            <div className="captured-query">
              <label htmlFor="captured-query-textarea" className="captured-label">
                Captured query:
              </label>
              <textarea
                id="captured-query-textarea"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                disabled={loading || disabled}
                className="captured-textarea"
                placeholder="Your voice input will appear here. You can edit it before submitting."
                rows={4}
                aria-label="Edit captured voice query"
              />
            </div>
          )}
        </div>
      )}

      {/* Picture Input Section */}
      {inputMode === 'picture' && (
        <div className="picture-input-container">
          <PictureInput
            onPictureCapture={handlePictureCapture}
            onReset={handleReset}
            disabled={loading || disabled}
          />
          {query && (
            <div className="captured-query">
              <label htmlFor="captured-picture-textarea" className="captured-label">
                Extracted query:
              </label>
              <textarea
                id="captured-picture-textarea"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                disabled={loading || disabled}
                className="captured-textarea"
                placeholder="Extracted text from your picture will appear here. You can edit it before submitting."
                rows={4}
                aria-label="Edit extracted picture query"
              />
            </div>
          )}
        </div>
      )}

      {/* Text Input Section */}
      {inputMode === 'text' && (
        <div className="text-input-container">
          <div className="input-with-reset">
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
            {query && (
              <button
                type="button"
                onClick={handleReset}
                disabled={loading || disabled}
                className="text-reset-button"
                aria-label="Clear input"
              >
                <span className="reset-icon">✕</span>
              </button>
            )}
          </div>
          <p id="query-hint" className="form-hint">
            Enter your research topic. Results will appear below.
          </p>
        </div>
      )}

      {/* Submit Button */}
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

