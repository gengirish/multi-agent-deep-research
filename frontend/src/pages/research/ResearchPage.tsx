import React, { useState } from "react";
import { ResearchForm } from "../../components/ResearchForm";
import { ResearchProgress } from "../../components/ResearchProgress";
import { ResearchResults } from "../../components/ResearchResults";
import { useResearchProgress } from "../../hooks/useResearchProgress";
import { ResearchData } from "../../types/dto";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ResearchPageProps {
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
}

export const ResearchPage: React.FC<ResearchPageProps> = ({
  initialQuery = "",
  onQueryChange,
}) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResearchData | null>(null);
  const {
    stages,
    startStage,
    updateStage,
    completeStage,
    errorStage,
    resetStages,
  } = useResearchProgress();

  const handleStreamingResearch = async (q: string) => {
    setQuery(q);
    setLoading(true);
    setResults(null);
    resetStages();

    try {
      const response = await fetch(`${API_URL}/api/research-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ query: q }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

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

      // Buffered SSE parser to handle chunk boundaries
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Decode chunk with streaming flag to handle multi-byte characters
        buffer += decoder.decode(value, { stream: true });

        // Normalize line endings
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Process complete SSE events (separated by double newlines)
        let eventSeparator: number;
        while ((eventSeparator = buffer.indexOf("\n\n")) !== -1) {
          const eventBlock = buffer.slice(0, eventSeparator);
          buffer = buffer.slice(eventSeparator + 2);

          // Parse all lines in this event block
          const lines = eventBlock.split("\n");
          for (const rawLine of lines) {
            const line = rawLine.trim();

            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6).trim();
                const data = JSON.parse(jsonStr);

                // Handle stage updates
                if (data.stage) {
                  const stageIndex = stageMap[data.stage];

                  if (stageIndex !== undefined) {
                    // Start the stage if not already started
                    if (!startedStages.has(stageIndex)) {
                      startStage(stageIndex);
                      startedStages.add(stageIndex);
                    }

                    // Update stage with message and progress
                    if (data.message) {
                      updateStage(stageIndex, { message: data.message });
                    }

                    if (data.progress !== undefined) {
                      updateStage(stageIndex, { progress: data.progress });
                    }
                  }
                }

                // Handle completion
                if (data.stage === "complete" && data.data) {
                  // Complete all stages
                  completeStage(0, "✓ Retrieved sources");
                  completeStage(1, "✓ Enrichment complete");
                  completeStage(2, "✓ Analysis complete");
                  completeStage(3, "✓ Insights generated");
                  completeStage(4, "✓ Report compiled");

                  setResults(data.data);
                  setLoading(false);
                  return;
                }

                // Handle errors
                if (data.stage === "error") {
                  // Find the last started stage (most likely to be active)
                  if (startedStages.size > 0) {
                    const lastStartedIndex = Math.max(
                      ...Array.from(startedStages)
                    );
                    errorStage(
                      lastStartedIndex,
                      data.message || "Unknown error"
                    );
                  }
                  throw new Error(data.message || "Unknown error");
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming research failed:", error);
      // Mark the last stage as error if any stages were started
      if (
        stages.some((s) => s.status === "active" || s.status === "complete")
      ) {
        const lastActiveIndex = stages.length - 1;
        errorStage(
          lastActiveIndex,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
      setResults({
        sources: {},
        analysis: {},
        insights: {},
        report: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      setLoading(false);
    }
  };

  return (
    <>
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
