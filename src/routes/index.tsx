import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QueueCare — Less waiting, better patient flow" },
      { name: "description", content: "Get a clinic queue token online and track your turn live." },
      { property: "og:title", content: "QueueCare — Less waiting, better patient flow" },
      {
        property: "og:description",
        content: "Get a clinic queue token online and track your turn live.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
