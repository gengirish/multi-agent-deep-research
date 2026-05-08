"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ResearchForm } from "../../components/ResearchForm";
import { ResearchProgress } from "../../components/ResearchProgress";
import { ResultsSkeleton } from "../../components/Skeleton";
import { useResearchProgress } from "../../hooks/useResearchProgress";
import { streamResearch } from "../../services/researchService";
import { ResearchData } from "../../types/dto";

// Heavy: pulls in D3, react-markdown, remark-gfm. Code-split it.
const ResearchResults = dynamic(
  () =>
    import("../../components/ResearchResults").then((m) => m.ResearchResults),
  { ssr: false, loading: () => <ResultsSkeleton /> }
);

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams?.get("q") ?? "";
  const seededRef = useRef(false);
  const {
    stages,
    startStage,
    updateStage,
    completeStage,
    errorStage,
    resetStages,
  } = useResearchProgress();

  const stageMap: Record<string, number> = {
    retrieval: 0,
    enrichment: 1,
    analyzer: 2,
    insight: 3,
    report: 4,
  };

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
            if (!startedStages.has(stageIndex)) {
              startStage(stageIndex);
              startedStages.add(stageIndex);
            }

            if (message) {
              updateStage(stageIndex, { message });
            }

            if (progress !== undefined) {
              updateStage(stageIndex, { progress });
            }
          }
        },
        onComplete: (data) => {
          completeStage(0, "✓ Retrieved sources");
          completeStage(1, "✓ Enrichment complete");
          completeStage(2, "✓ Analysis complete");
          completeStage(3, "✓ Insights generated");
          completeStage(4, "✓ Report compiled");

          setResults(data);
          setLoading(false);
        },
        onError: (err) => {
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

  useEffect(() => {
    if (seededRef.current) return;
    if (urlQuery && urlQuery.trim()) {
      seededRef.current = true;
      onQueryChange?.(urlQuery);
      handleStreamingResearch(urlQuery);
      const next = new URLSearchParams(
        searchParams ? searchParams.toString() : ""
      );
      next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || "/research");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const handleDismissError = () => {
    setError(null);
  };

  return (
    <>
      <h1 className="visually-hidden">Research</h1>

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
