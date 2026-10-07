import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
let actions: typeof import("@/test/fixtures/queue-store").actions;
let useQueue: typeof import("@/test/fixtures/queue-store").useQueue;

describe("local QueueCare flows", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ actions, useQueue } = await import("@/test/fixtures/queue-store"));
  });
  it("completes the current patient without automatically calling the next", () => {
    const { result } = renderHook(() => useQueue());
    act(() => actions.markDone());
    expect(result.current.serving).toBeNull();
    expect(result.current.waiting[0]?.token).toBe("A-020");
    act(() => actions.callNext());
    expect(result.current.serving?.token).toBe("A-020");
  });
  it("returns the patient's existing token without issuing a duplicate", () => {
    const { result } = renderHook(() => useQueue());
    let token = "";
    act(() => {
      token = actions.join("Zain Ahmed", "+92 300 1234567", "Follow-up");
    });
    expect(token).toBe("A-024");
    expect(result.current.waiting).toHaveLength(5);
    expect(result.current.ahead).toBe(4);
    expect(result.current.eta).toBe(20);
  });
  it("records a completed patient visit in history", () => {
    const { result } = renderHook(() => useQueue());
    act(() => actions.call("A-024"));
    act(() => actions.markDone());
    expect(result.current.mine?.status).toBe("done");
    expect(result.current.history[0]?.token).toBe("A-024");
    expect(result.current.history[0]?.status).toBe("done");
  });
  it("cancels a token and prevents joining a closed queue", () => {
    const { result } = renderHook(() => useQueue());
    act(() => actions.leave());
    expect(result.current.mine).toBeNull();
    expect(result.current.history[0]?.status).toBe("left");
    act(() => actions.toggleOpen());
    expect(() => actions.join("Zain Ahmed", "03001234567", "")).toThrow(/closed/i);
  });
  it("requeues a skipped token and keeps only one serving patient", () => {
    const { result } = renderHook(() => useQueue());
    act(() => actions.call("A-024"));
    act(() => actions.skip());
    expect(result.current.mine?.status).toBe("skipped");
    act(() => actions.requeue("A-024"));
    expect(result.current.mine?.status).toBe("waiting");
    act(() => actions.callNext());
    expect(result.current.queue.filter((e) => e.status === "serving")).toHaveLength(1);
  });
  it("issues unique numeric tokens when settings use a longer prefix", () => {
    const { result } = renderHook(() => useQueue());
    act(() => actions.saveSettings({ ...result.current.clinic, prefix: "ABC" }, 5));
    act(() => actions.leave());
    let first = "";
    let second = "";
    act(() => {
      first = actions.join("Zain Ahmed", "03001234567", "");
    });
    act(() => actions.leave());
    act(() => {
      second = actions.join("Zain Ahmed", "03001234567", "");
    });
    expect(first).toBe("ABC-025");
    expect(second).toBe("ABC-026");
  });
});
