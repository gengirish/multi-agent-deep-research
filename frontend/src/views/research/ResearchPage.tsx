"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ErrorBanner } from "../../components/ErrorBanner";
import { ResearchForm } from "../../components/ResearchForm";
import { ResearchProgress } from "../../components/ResearchProgress";
import { ResultsSkeleton } from "../../components/Skeleton";
import { useResearchProgress } from "../../hooks/useResearchProgress";
import { streamResearchJob } from "../../services/researchService";
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
  const [shareId, setShareId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams?.get("q") ?? "";
  const seededRef = useRef(false);
  // The query actually in flight — `initialQuery` is a prop and goes stale as
  // soon as the user edits the form, so Retry cannot rely on it.
  const lastQueryRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
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
    // Detach any previous run before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    lastQueryRef.current = q;
    setLoading(true);
    setResults(null);
    setError(null);
    setShareId(null);
    setCancelled(false);
    resetStages();
    startedStages.clear();

    try {
      await streamResearchJob(q, {
        onJobId: (jobId) => {
          // Stash the job id so the results view can offer a shareable
          // /r/[id] link. The same id backs the persisted Postgres row.
          setShareId(jobId);
        },
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
          if (controller.signal.aborted) return;
          completeStage(0, "✓ Retrieved sources");
          completeStage(1, "✓ Enrichment complete");
          completeStage(2, "✓ Analysis complete");
          completeStage(3, "✓ Insights generated");
          completeStage(4, "✓ Report compiled");

          setResults(data);
          setLoading(false);
        },
        onError: (err) => {
          if (controller.signal.aborted) return;
          if (startedStages.size > 0) {
            const lastStartedIndex = Math.max(...Array.from(startedStages));
            errorStage(lastStartedIndex, err.message);
          }

          setError(err);
          setLoading(false);
        },
      }, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) return;
      const errorObj = err instanceof Error ? err : new Error("Unknown error");
      setError(errorObj);
      setLoading(false);
    }
  };

  const handleRetry = () => {
    const q = lastQueryRef.current || initialQuery;
    if (q.trim()) {
      handleStreamingResearch(q);
    }
  };

  // Stop watching the stream. There is no server-side cancel, so the worker
  // finishes and the report still lands in History.
  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setCancelled(true);
  };

  // Close the stream if the user navigates away mid-run.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

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

      {loading && (
        <ResearchProgress stages={stages} onCancel={handleCancel} />
      )}

      {cancelled && !loading && (
        <p className="research-cancelled" role="status">
          Stopped watching this run. The agents keep working — the finished
          report will show up in{" "}
          <Link href="/history">History</Link>.
        </p>
      )}

      {results && !loading && (
        <ResearchResults data={results} shareId={shareId ?? undefined} />
      )}
    </>
  );
};
