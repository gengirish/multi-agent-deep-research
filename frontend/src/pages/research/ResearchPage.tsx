import React, { useState } from "react";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ResearchForm } from "../../components/ResearchForm";
import { ResearchProgress } from "../../components/ResearchProgress";
import { ResearchResults } from "../../components/ResearchResults";
import { useResearchProgress } from "../../hooks/useResearchProgress";
import { streamResearch } from "../../services/researchService";
import { ResearchData } from "../../types/dto";

interface ResearchPageProps {
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
}

export const ResearchPage: React.FC<ResearchPageProps> = ({
  initialQuery = "",
  onQueryChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResearchData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const {
    stages,
    startStage,
    updateStage,
    completeStage,
    errorStage,
    resetStages,
  } = useResearchProgress();

  // Stage mapping: Map backend stages to our progress stages
  const stageMap: Record<string, number> = {
    retrieval: 0, // Retriever
    enrichment: 1, // Enricher
    analyzer: 2, // Analyzer
    insight: 3, // Insight
    report: 4, // Reporter
  };

  // Track which stages have been started
  const startedStages = new Set<number>();

  const handleStreamingResearch = async (q: string) => {
    setLoading(true);
    setResults(null);
    setError(null);
    resetStages();
    startedStages.clear();

    try {
      await streamResearch(q, {
        onStageUpdate: (stage, message, progress) => {
          const stageIndex = stageMap[stage];

          if (stageIndex !== undefined) {
            // Start the stage if not already started
            if (!startedStages.has(stageIndex)) {
              startStage(stageIndex);
              startedStages.add(stageIndex);
            }

            // Update stage with message and progress
            if (message) {
              updateStage(stageIndex, { message });
            }

            if (progress !== undefined) {
              updateStage(stageIndex, { progress });
            }
          }
        },
        onComplete: (data) => {
          // Complete all stages
          completeStage(0, "✓ Retrieved sources");
          completeStage(1, "✓ Enrichment complete");
          completeStage(2, "✓ Analysis complete");
          completeStage(3, "✓ Insights generated");
          completeStage(4, "✓ Report compiled");

          setResults(data);
          setLoading(false);
        },
        onError: (err) => {
          // Find the last started stage
          if (startedStages.size > 0) {
            const lastStartedIndex = Math.max(...Array.from(startedStages));
            errorStage(lastStartedIndex, err.message);
          }

          setError(err);
          setLoading(false);
        },
      });
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Unknown error");
      setError(errorObj);
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (initialQuery) {
      handleStreamingResearch(initialQuery);
    }
  };

  const handleDismissError = () => {
    setError(null);
  };

  return (
    <>
      {error && (
        <ErrorBanner
          error={error}
          onRetry={handleRetry}
          onDismiss={handleDismissError}
        />
      )}

      <ResearchForm
        onSubmit={handleStreamingResearch}
        loading={loading}
        disabled={loading}
        initialQuery={initialQuery}
        onQueryChange={onQueryChange}
      />

      {loading && <ResearchProgress stages={stages} />}

      {results && !loading && <ResearchResults data={results} />}
    </>
  );
};
