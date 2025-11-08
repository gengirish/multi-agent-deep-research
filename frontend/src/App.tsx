import React, { useState } from 'react'
import { ResearchForm } from './components/ResearchForm'
import { ResearchResults } from './components/ResearchResults'
import { LoadingProgress } from './components/LoadingProgress'
import './App.css'

// API URL from environment variable or default to localhost
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface ResearchData {
  sources: Record<string, any>
  analysis: Record<string, any>
  insights: Record<string, any>
  report: string
  status: string
  error?: string
}

export const App: React.FC = () => {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ResearchData | null>(null)
  const [currentStage, setCurrentStage] = useState<string>('')
  const [progress, setProgress] = useState(0)

  const handleResearch = async (q: string) => {
    setQuery(q)
    setLoading(true)
    setResults(null)
    setCurrentStage('')
    setProgress(0)

    try {
      const response = await fetch(`${API_URL}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setResults(data)
    } catch (error) {
      console.error('Research failed:', error)
      setResults({
        sources: {},
        analysis: {},
        insights: {},
        report: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
      setCurrentStage('')
      setProgress(0)
    }
  }

  const handleStreamingResearch = async (q: string) => {
    setQuery(q)
    setLoading(true)
    setResults(null)
    setCurrentStage('')
    setProgress(0)

    try {
      const response = await fetch(`${API_URL}/api/research-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.stage) {
                setCurrentStage(data.stage)
                if (data.message) {
                  // Update progress
                }
                if (data.progress !== undefined) {
                  setProgress(data.progress)
                }
              }

              if (data.stage === 'complete' && data.data) {
                setResults(data.data)
                setLoading(false)
                setCurrentStage('')
                setProgress(100)
                return
              }

              if (data.stage === 'error') {
                throw new Error(data.message || 'Unknown error')
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming research failed:', error)
      setResults({
        sources: {},
        analysis: {},
        insights: {},
        report: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      setLoading(false)
      setCurrentStage('')
      setProgress(0)
    }
  }

  return (
    <div className="app-container" role="main">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      
      <header className="app-header" role="banner">
        <h1>🤖 Multi-Agent AI Deep Researcher</h1>
        <p>Accessible research powered by specialized AI agents</p>
      </header>

      <main id="main-content" className="app-main">
        <ResearchForm 
          onSubmit={handleStreamingResearch} 
          loading={loading}
          disabled={loading}
        />
        
        {loading && (
          <LoadingProgress 
            stage={currentStage} 
            progress={progress}
          />
        )}
        
        {results && !loading && (
          <ResearchResults data={results} />
        )}
      </main>

      <footer className="app-footer" role="contentinfo">
        <p>Multi-Agent AI Deep Researcher | Built with React, Vite, and FastAPI</p>
      </footer>
    </div>
  )
}

