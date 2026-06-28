"use client";

import React from 'react'
import { ProgressStage } from '../hooks/useResearchProgress'
import { Icon } from './icons'
import './ResearchProgress.css'

interface Props {
  stages: ProgressStage[]
}

export const ResearchProgress: React.FC<Props> = ({ stages }) => {
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

  return (
    <section
      className="research-progress"
      role="region"
      aria-label="Research progress"
      aria-live="polite"
    >
      <div className="progress-header">
        <h2>Research in Progress</h2>
        <span className="overall-progress">
          {Math.round(
            stages.reduce((acc, s) => acc + s.progress, 0) / stages.length
          )}%
        </span>
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

