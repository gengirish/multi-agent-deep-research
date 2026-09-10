import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamResearchJob } from "@/services/researchService";

/**
 * `streamResearchJob` opens an EventSource that only the caller can close.
 * These cover the abort path: a cancelled run must close the stream and stop
 * delivering callbacks, because the page uses cancellation both for the Stop
 * button and for unmount cleanup when the user navigates away mid-run.
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;

  url: string;
  readyState = 0;
  closed = false;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ job_id: "job-1" }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamResearchJob cancellation", () => {
  it("never enqueues when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await streamResearchJob("q", {}, controller.signal);

    expect(fetch).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("closes the stream and resolves when aborted mid-run", async () => {
    const controller = new AbortController();
    const onStageUpdate = vi.fn();
    const onError = vi.fn();

    const done = streamResearchJob(
      "q",
      { onStageUpdate, onError },
      controller.signal,
    );
    await flush();

    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();

    es.emit({ stage: "retrieval", message: "searching", progress: 20 });
    expect(onStageUpdate).toHaveBeenCalledTimes(1);

    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(es.closed).toBe(true);

    // A late event after cancel must not reach the page.
    es.emit({ stage: "enrichment", message: "late", progress: 40 });
    expect(onStageUpdate).toHaveBeenCalledTimes(1);
    // Cancelling is deliberate, so it is not surfaced as a failure.
    expect(onError).not.toHaveBeenCalled();
  });

  it("still delivers a normal completion when not aborted", async () => {
    const onComplete = vi.fn();
    const data = { report: "done" };

    const done = streamResearchJob("q", { onComplete });
    await flush();

    FakeEventSource.instances[0].emit({ stage: "complete", data });
    await expect(done).resolves.toBeUndefined();

    expect(onComplete).toHaveBeenCalledWith(data);
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
