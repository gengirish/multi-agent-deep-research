import { useState } from 'react'
import type { IconName } from '../components/icons'

export interface ProgressStage {
  name: string
  icon: IconName
  status: 'pending' | 'active' | 'complete' | 'error'
  message: string
  progress: number  // 0-100
  startTime: number
  endTime?: number
}

const INITIAL_STAGES: ProgressStage[] = [
  {
    name: 'Retriever',
    icon: 'retriever',
    status: 'pending',
    message: 'Preparing to fetch sources...',
    progress: 0,
    startTime: 0,
  },
  {
    name: 'Enricher',
    icon: 'enricher',
    status: 'pending',
    message: 'Waiting for sources...',
    progress: 0,
    startTime: 0,
  },
  {
    name: 'Analyzer',
    icon: 'analyzer',
    status: 'pending',
    message: 'Waiting for enrichment...',
    progress: 0,
    startTime: 0,
  },
  {
    name: 'Insight',
    icon: 'insight',
    status: 'pending',
    message: 'Waiting for analysis...',
    progress: 0,
    startTime: 0,
  },
  {
    name: 'Reporter',
    icon: 'reporter',
    status: 'pending',
    message: 'Waiting for insights...',
    progress: 0,
    startTime: 0,
  },
]

const cloneInitialStages = (): ProgressStage[] =>
  INITIAL_STAGES.map((stage) => ({ ...stage }))

export const useResearchProgress = () => {
  const [stages, setStages] = useState<ProgressStage[]>(cloneInitialStages)

  const updateStage = (
    stageIndex: number,
    updates: Partial<ProgressStage>
  ) => {
    setStages((prev) =>
      prev.map((stage, idx) =>
        idx === stageIndex ? { ...stage, ...updates } : stage
      )
    )
  }

  const startStage = (stageIndex: number) => {
    updateStage(stageIndex, {
      status: 'active',
      startTime: Date.now(),
      progress: 10, // Start animation
    })
  }

  const completeStage = (stageIndex: number, message?: string) => {
    updateStage(stageIndex, {
      status: 'complete',
      progress: 100,
      endTime: Date.now(),
      message: message || 'Complete',
    })
  }

  const errorStage = (stageIndex: number, error: string) => {
    updateStage(stageIndex, {
      status: 'error',
      message: error,
      progress: 0,
    })
  }

  const resetStages = () => {
    setStages(cloneInitialStages())
  }

  return {
    stages,
    updateStage,
    startStage,
    completeStage,
    errorStage,
    resetStages,
  }
}

