import { createFileRoute } from "@tanstack/react-router";
import { Display } from "@/screens/public-display-screen";
export { Display } from "@/screens/public-display-screen";

export const Route = createFileRoute("/public-display")({
  component: Display,
});
