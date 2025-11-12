/**
 * Research Service
 * Handles research API calls including SSE streaming with retry/backoff
 */

import { ResearchData } from "../types/dto";
import { getApiUrl } from "./http";

interface StreamEvent {
  stage: string;
  message: string;
  progress?: number;
  data?: ResearchData;
}

interface StreamCallbacks {
  onStageUpdate?: (stage: string, message: string, progress?: number) => void;
  onComplete?: (data: ResearchData) => void;
  onError?: (error: Error) => void;
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
                    data.message,
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
                  throw new Error(data.message || "Unknown error");
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
