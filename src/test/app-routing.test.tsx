import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
describe("App routing", () => {
  it.each([
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/complete-profile",
    "/patient/dashboard",
    "/patient/get-token",
    "/patient/live-queue",
    "/patient/history",
    "/admin",
    "/admin/live-queue",
    "/admin/history",
    "/admin/patients",
    "/admin/settings",
    "/admin/clinics",
    "/admin/appointments",
    "/public-display",
    "/patient/join-queue",
    "/patient/queue",
    "/admin/queue",
  ])("registers %s as a page rather than not found", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes(path);
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.at(-1)?.pathname.replace(/\/$/, "")).toBe(path.replace(/\/$/, ""));
  });
});
