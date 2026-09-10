"use client";

import React, { useEffect, useRef, useState } from 'react'
import { ProgressStage } from '../hooks/useResearchProgress'
import { Icon } from './icons'
import './ResearchProgress.css'

interface Props {
  stages: ProgressStage[]
  /** Detach from the stream. Omit to hide the stop control. */
  onCancel?: () => void
}

/**
 * Observed median for a five-agent run. Used only to frame the wait — we
 * never show a countdown, because overrunning a promised number reads worse
 * than showing no number at all.
 */
const TYPICAL_RUN_SECONDS = 60

export const ResearchProgress: React.FC<Props> = ({ stages, onCancel }) => {
  // Elapsed clock. The panel mounts when the run starts and unmounts when it
  // ends, so mount time is the run's start time.
  const startedAtRef = useRef<number>(Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const getStatusColor = (status: ProgressStage['status']) => {
    switch (status) {
      case 'complete':
        return 'var(--c-success, #22c55e)'
      case 'active':
        return 'var(--c-accent, #818cf8)'
      case 'error':
        return 'var(--c-error, #ef4444)'
      case 'pending':
      default:
        return 'rgba(148, 163, 184, 0.4)'
    }
  }

  const StatusIcon: React.FC<{ status: ProgressStage['status'] }> = ({
    status,
  }) => {
    switch (status) {
      case 'complete':
        return <Icon name="check" size={13} />
      case 'active':
        return <Icon name="loader" size={13} />
      case 'error':
        return <Icon name="close" size={13} />
      case 'pending':
      default:
        return <Icon name="circle" size={11} />
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    return `${seconds}s`
  }

  const formatClock = (ms: number) => {
    const total = Math.floor(ms / 1000)
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const runningLong = elapsedSeconds > TYPICAL_RUN_SECONDS * 2

  return (
    <section
      className="research-progress"
      role="region"
      aria-label="Research progress"
      aria-live="polite"
    >
      <div className="progress-header">
        <div className="progress-heading">
          <h2>Research in Progress</h2>
          <p className="progress-elapsed">
            {/* Ticks every second inside an aria-live region — announcing it
                would drown out the stage messages, so keep it visual. */}
            <span className="progress-elapsed__clock" aria-hidden="true">
              {formatClock(elapsedMs)}
            </span>
            <span className="progress-elapsed__hint">
              {runningLong
                ? 'longer than usual — still running'
                : `most runs finish in about ${TYPICAL_RUN_SECONDS}s`}
            </span>
          </p>
        </div>

        <div className="progress-header-actions">
          <span className="overall-progress">
            {Math.round(
              stages.reduce((acc, s) => acc + s.progress, 0) / stages.length
            )}%
          </span>
          {onCancel && (
            <button
              type="button"
              className="progress-stop"
              onClick={onCancel}
              title="Stop watching. The agents keep working and the report lands in History."
            >
              <Icon name="close" size={13} />
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="stages-container">
        {stages.map((stage, index) => {
          const isActive = stage.status === 'active'
          const isComplete = stage.status === 'complete'
          const duration = stage.endTime
            ? formatTime(stage.endTime - stage.startTime)
            : null

          return (
            <div
              key={index}
              className={`stage ${stage.status}`}
              role="progressbar"
              aria-valuenow={stage.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${stage.name}: ${stage.message}`}
            >
              {/* Stage header */}
              <div className="stage-header">
                <div className="stage-title">
                  <span className="stage-icon">
                    <Icon name={stage.icon} size={18} />
                  </span>
                  <span className="stage-name">{stage.name}</span>
                </div>

                <div className="stage-meta">
                  <span
                    className={`status-badge ${stage.status}`}
                    aria-hidden="true"
                  >
                    <StatusIcon status={stage.status} />
                  </span>
                  {duration && (
                    <span className="stage-time" aria-label={`Duration: ${duration}`}>
                      {duration}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="progress-bar-container">
                <div
                  className={`progress-bar ${stage.status}`}
                  style={{
                    width: `${stage.progress}%`,
                    backgroundColor: getStatusColor(stage.status),
                  }}
                  aria-hidden="true"
                >
                  {isActive && <div className="shimmer" />}
                </div>
              </div>

              {/* Message */}
              <p className={`stage-message ${stage.status}`}>
                {stage.message}
              </p>

              {/* Connector line (except last stage) */}
              {index < stages.length - 1 && (
                <div
                  className={`stage-connector ${
                    isComplete ? 'complete' : 'pending'
                  }`}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Overall status */}
      <div className="progress-footer" role="status">
        {stages.every((s) => s.status === 'complete') ? (
          <span className="status-text status-text--complete">
            <Icon name="check" size={16} />
            Research complete
          </span>
        ) : stages.some((s) => s.status === 'error') ? (
          <span className="status-text status-text--error">
            <Icon name="alert" size={16} />
            Research encountered an error
          </span>
        ) : (
          <span className="status-text status-text--active">
            <span className="status-text__spinner">
              <Icon name="loader" size={16} />
            </span>
            Researching…
          </span>
        )}
      </div>
    </section>
  )
}

