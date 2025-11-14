import React, { useState, useEffect, useRef } from 'react'
import './VoiceInput.css'

// TypeScript declarations for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition
    }
    webkitSpeechRecognition: {
      new (): SpeechRecognition
    }
  }
}

interface Props {
  onVoiceCapture: (text: string) => void
  onReset?: () => void
  disabled?: boolean
}

export const VoiceInput: React.FC<Props> = ({ onVoiceCapture, onReset, disabled = false }) => {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Check if browser supports Web Speech API
  const isSupported = typeof window !== 'undefined' && 
    (window.SpeechRecognition || (window as any).webkitSpeechRecognition)

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
    }
  }, [])

  const handleVoiceInput = async () => {
    if (disabled || !isSupported) return
    
    try {
      setIsListening(true)
      setError(null)
      setTranscript('')
      
      // Get SpeechRecognition class
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()

      // Configure recognition
      recognition.continuous = true  // Keep listening until stop is clicked
      recognition.interimResults = true
      recognition.lang = 'en-US'
      
      // Store reference for cleanup
      recognitionRef.current = recognition
      
      // Handle results
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let completeTranscript = ''

        // Collect all final results
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            completeTranscript += transcript + ' '
          }
        }

        // Add interim results from the latest
        if (event.results.length > 0) {
          const lastResult = event.results[event.results.length - 1]
          if (!lastResult.isFinal) {
            completeTranscript += lastResult[0].transcript
          }
        }

        // Update transcript display continuously
        const trimmedTranscript = completeTranscript.trim()
        if (trimmedTranscript) {
          setTranscript(trimmedTranscript)
        }
      }
      
      // Handle errors
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        let errorMessage = 'Speech recognition error'
        
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'No speech detected. Please try again.'
            break
          case 'audio-capture':
            errorMessage = 'No microphone found. Please check your microphone.'
            break
          case 'not-allowed':
            errorMessage = 'Microphone permission denied. Please allow microphone access.'
            break
          case 'network':
            errorMessage = 'Network error. Please check your connection.'
            break
          default:
            errorMessage = `Speech recognition error: ${event.error}`
        }
        
        setError(errorMessage)
        setIsListening(false)
      }
      
      // Handle end
      recognition.onend = () => {
        setIsListening(false)
        recognitionRef.current = null
      }
      
      // Start recognition
      recognition.start()
      
    } catch (err: any) {
      setError(err.message || 'Voice input failed')
      setIsListening(false)
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)

    // Capture the transcript without auto-submitting
    if (transcript.trim()) {
      onVoiceCapture(transcript.trim())
    }
  }

  const handleReset = () => {
    // Stop listening if active
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setTranscript('')
    setError(null)

    // Call parent reset handler
    if (onReset) {
      onReset()
    }
  }

  if (!isSupported) {
    return (
      <div className="voice-input-unavailable" role="status">
        <span className="warning-icon">⚠️</span>
        <p>Voice input is not supported in your browser</p>
        <p className="hint">Please use Chrome, Edge, or Safari for voice input</p>
      </div>
    )
  }

  return (
    <div className="voice-input" role="region" aria-label="Voice input">
      <button
        type="button"
        onClick={isListening ? stopListening : handleVoiceInput}
        disabled={disabled}
        className={`voice-button ${isListening ? 'listening' : ''}`}
        aria-label={isListening ? 'Stop listening' : 'Start voice input'}
        aria-pressed={isListening}
      >
        <span className="voice-icon">
          {isListening ? '🛑' : '🎤'}
        </span>
        <span className="voice-text">
          {isListening ? 'Stop Listening' : 'Speak Your Research Query'}
        </span>
      </button>
      
      {isListening && (
        <div className="listening-indicator" aria-live="polite">
          <div className="pulse-dot"></div>
          <span>Listening...</span>
        </div>
      )}
      
      {transcript && (
        <div className="voice-transcript" role="status" aria-live="polite">
          <span className="transcript-label">Transcript:</span>
          <p className="transcript-text">{transcript}</p>
        </div>
      )}
      
      {error && (
        <div className="voice-error" role="alert">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      {transcript && !isListening && (
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className="reset-button"
          aria-label="Reset voice input"
        >
          <span className="reset-icon">🔄</span>
          <span className="reset-text">Reset</span>
        </button>
      )}
    </div>
  )
}

