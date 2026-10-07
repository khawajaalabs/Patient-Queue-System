import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { actions } from "@/test/fixtures/queue-store";
import {
  ConfirmAction,
  Notifications,
  PatientStatus,
  QueueBoundary,
} from "@/components/queue-feedback";
import { Btn } from "@/components/qc";
import { QueueToggle } from "@/components/admin-queue-states";
import { PatientDrawer } from "@/components/patient-drawer";
import { renderHook } from "@testing-library/react";
import { useQueue } from "@/lib/queue-store";

beforeEach(() => {
  cleanup();
  actions.resetDemo();
});
describe("queue UI interactions", () => {
  it("keeps the token until leaving is confirmed", () => {
    const { result } = renderHook(() => useQueue());
    render(
      <ConfirmAction
        title="Leave this queue?"
        description="Your current token will be released."
        cancel="Stay in queue"
        confirm="Leave queue"
        onConfirm={actions.leave}
      >
        <Btn>Release token</Btn>
      </ConfirmAction>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Release token" }));
    expect(result.current.mine?.token).toBe("A-024");
    fireEvent.click(screen.getByRole("button", { name: "Stay in queue" }));
    expect(result.current.mine?.token).toBe("A-024");
    fireEvent.click(screen.getByRole("button", { name: "Release token" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave queue" }));
    expect(result.current.mine).toBeNull();
    expect(result.current.history[0]?.status).toBe("left");
  });
  it("only closes today's queue after confirmation", () => {
    const { result } = renderHook(() => useQueue());
    render(<QueueToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Close queue" }));
    expect(result.current.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(result.current.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close queue" }));
    fireEvent.click(screen.getByRole("button", { name: "Close queue" }));
    expect(result.current.open).toBe(false);
  });
  it("keeps the page inside its layout while loading and recovers from errors", () => {
    act(() => actions.setLoadState("loading"));
    render(
      <QueueBoundary>
        <h1>Queue contents</h1>
      </QueueBoundary>,
    );
    expect(screen.getByRole("status", { name: "Loading queue" })).toBeInTheDocument();
    expect(screen.queryByText("Queue contents")).not.toBeInTheDocument();
    act(() => actions.setLoadState("error"));
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load queue status.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Queue contents")).toBeInTheDocument();
  });
  it("changes patient guidance through almost, called and completed states", () => {
    render(<PatientStatus />);
    expect(screen.getByRole("status")).toHaveTextContent("You're in the queue.");
    act(() => actions.demo("almost"));
    expect(screen.getByRole("status")).toHaveTextContent("2 patients are ahead");
    act(() => actions.call("A-024"));
    expect(screen.getByRole("status")).toHaveTextContent("Your token is being called.");
    act(() => actions.markDone());
    expect(screen.getByRole("status")).toHaveTextContent("Visit completed.");
  });
  it("updates the open patient drawer after a call and completion", () => {
    const { result } = renderHook(() => useQueue());
    render(<PatientDrawer entry={result.current.mine} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Call patient" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Serving");
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Completed");
    expect(result.current.history[0]?.token).toBe("A-024");
  });
});
