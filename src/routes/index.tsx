import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neuro Spine Care Center — Less waiting, better patient flow" },
      {
        name: "description",
        content: "Book a clinic appointment, receive your token and track your turn live.",
      },
      {
        property: "og:title",
        content: "Neuro Spine Care Center — Less waiting, better patient flow",
      },
      {
        property: "og:description",
        content: "Book a clinic appointment, receive your token and track your turn live.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
