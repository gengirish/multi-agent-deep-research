/**
 * Research Service
 * Handles research API calls including SSE streaming with retry/backoff
 */

import { ResearchData } from "../types/dto";
import { getApiUrl } from "./http";

interface StreamEvent {
  stage: string;
  message?: string;
  progress?: number;
  data?: ResearchData;
  job_id?: string;
}

interface StreamCallbacks {
  onStageUpdate?: (stage: string, message: string, progress?: number) => void;
  onComplete?: (data: ResearchData) => void;
  onError?: (error: Error) => void;
  onJobId?: (jobId: string) => void;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(
    config.baseDelay * Math.pow(2, attempt),
    config.maxDelay
  );
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

/**
 * Stream research results with SSE
 */
export async function streamResearch(
  query: string,
  callbacks: StreamCallbacks,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<void> {
  let attempt = 0;

  const attemptStream = async (): Promise<void> => {
    try {
      const API_URL = getApiUrl();
      const response = await fetch(`${API_URL}/api/research-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

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
                const data = JSON.parse(jsonStr) as StreamEvent;

                // Handle stage updates
                if (
                  data.stage &&
                  data.stage !== "complete" &&
                  data.stage !== "error"
                ) {
                  callbacks.onStageUpdate?.(
                    data.stage,
                    data.message ?? "",
                    data.progress
                  );
                }

                // Handle completion
                if (data.stage === "complete" && data.data) {
                  callbacks.onComplete?.(data.data);
                  return; // Success, exit retry loop
                }

                // Handle errors
                if (data.stage === "error") {
                  throw new Error(data.message ?? "Unknown error");
                }
              } catch (parseError) {
                console.error("Error parsing SSE data:", parseError);
                // Continue processing other events
              }
            }
          }
        }
      }
    } catch (error) {
      // Check if we should retry
      if (attempt < retryConfig.maxRetries) {
        attempt++;
        const delay = getBackoffDelay(attempt - 1, retryConfig);

        console.warn(
          `Stream failed (attempt ${attempt}/${retryConfig.maxRetries}), retrying in ${delay}ms...`,
          error
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry
        return attemptStream();
      } else {
        // Max retries exceeded
        const finalError =
          error instanceof Error
            ? error
            : new Error("Stream failed after max retries");
        callbacks.onError?.(finalError);
        throw finalError;
      }
    }
  };

  return attemptStream();
}

/**
 * Non-streaming research request (fallback)
 */
export async function performResearch(query: string): Promise<ResearchData> {
  const API_URL = getApiUrl();

  const response = await fetch(`${API_URL}/api/research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Queue-backed research flow (production path).
 *
 * 1. POST /api/research/jobs       → returns job_id
 * 2. EventSource on /api/research/jobs/{id}/stream → live worker progress
 * 3. On disconnect or completion, fetch final row from /api/research/jobs/{id}
 *
 * This is the path that survives killed workers, browser-closes, and Fly
 * machine restarts because the work happens in a separate worker process
 * and the result is persisted to Postgres before the SSE channel closes.
 */
export async function streamResearchJob(
  query: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const API_URL = getApiUrl();

  // 1. Enqueue
  const createRes = await fetch(`${API_URL}/api/research/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!createRes.ok) {
    throw new Error(
      `Failed to enqueue (HTTP ${createRes.status}): ${createRes.statusText}`
    );
  }

  const { job_id: jobId } = (await createRes.json()) as { job_id: string };
  callbacks.onJobId?.(jobId);

  // 2. Open SSE stream. EventSource handles reconnection automatically;
  //    we close it once we see a terminal event or hit a hard error.
  const streamUrl = `${API_URL}/api/research/jobs/${encodeURIComponent(
    jobId
  )}/stream`;

  return new Promise<void>((resolve, reject) => {
    const es = new EventSource(streamUrl, { withCredentials: false });
    let settled = false;
    const finishOk = () => {
      if (settled) return;
      settled = true;
      es.close();
      resolve();
    };
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      es.close();
      callbacks.onError?.(err);
      reject(err);
    };

    es.onmessage = async (ev) => {
      let parsed: StreamEvent;
      try {
        parsed = JSON.parse(ev.data) as StreamEvent;
      } catch (e) {
        console.warn("Bad SSE payload:", ev.data);
        return;
      }

      if (
        parsed.stage &&
        parsed.stage !== "complete" &&
        parsed.stage !== "error"
      ) {
        callbacks.onStageUpdate?.(
          parsed.stage,
          parsed.message ?? "",
          parsed.progress
        );
      }

      if (parsed.stage === "complete") {
        if (parsed.data) {
          callbacks.onComplete?.(parsed.data);
        } else {
          // Server didn't inline the data — fetch the final row.
          try {
            const final = await fetchJobResult(jobId);
            callbacks.onComplete?.(final);
          } catch (e) {
            return finishErr(e instanceof Error ? e : new Error(String(e)));
          }
        }
        return finishOk();
      }

      if (parsed.stage === "error") {
        return finishErr(new Error(parsed.message || "Worker reported error"));
      }
    };

    es.onerror = async () => {
      // EventSource's `error` fires for both transient blips and final close.
      // Check readyState: if CLOSED, treat as terminal; if CONNECTING, the
      // browser will reconnect on its own.
      if (es.readyState === EventSource.CLOSED) {
        // Last-chance: the worker may have already finished — poll the row.
        try {
          const final = await fetchJobResult(jobId);
          callbacks.onComplete?.(final);
          return finishOk();
        } catch (e) {
          return finishErr(
            e instanceof Error ? e : new Error("Stream closed unexpectedly")
          );
        }
      }
      // CONNECTING: silent — browser will retry.
    };
  });
}

/**
 * Fetch the final/current state of a job from Postgres.
 * Used by the share route (/r/[id]) and as a fallback when the SSE
 * stream drops before delivering a `complete` event.
 */
export async function fetchJobResult(jobId: string): Promise<ResearchData> {
  const API_URL = getApiUrl();
  const res = await fetch(
    `${API_URL}/api/research/jobs/${encodeURIComponent(jobId)}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch job ${jobId}: HTTP ${res.status}`);
  }
  // The /api/research/jobs/{id} endpoint mirrors the ConversationDetail
  // shape used by /api/conversations/{id}, so we extract `.data`.
  const wrapped = (await res.json()) as { data: ResearchData };
  return wrapped.data;
}
