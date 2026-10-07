import { BroadcastChannel as LocalChannel } from "node:worker_threads";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { actions, useQueue } from "@/test/fixtures/queue-store";

beforeEach(() => {
  cleanup();
  actions.resetDemo();
  vi.stubGlobal("BroadcastChannel", LocalChannel);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shares queue changes with another local display tab", async () => {
  const peer = new LocalChannel("queuecare-local-demo");
  try {
    const { result } = renderHook(() => useQueue());
    peer.postMessage({ type: "state", state: { ...result.current, open: false } });
    await waitFor(() => expect(result.current.open).toBe(false));
    const messages: {
      type: string;
      state?: { serving?: unknown; queue: { token: string; status: string }[] };
    }[] = [];
    peer.onmessage = (event) => {
      messages.push(event.data as (typeof messages)[number]);
    };
    act(() => actions.callNext());
    await waitFor(() =>
      expect(
        messages.some(
          (message) =>
            message.type === "state" &&
            message.state?.queue.some(
              (entry) => entry.token === "A-020" && entry.status === "serving",
            ),
        ),
      ).toBe(true),
    );
  } finally {
    peer.close();
  }
});
