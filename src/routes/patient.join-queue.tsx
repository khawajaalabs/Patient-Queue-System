import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Btn, PageHeader } from "@/components/qc";
export const Route = createFileRoute("/patient/join-queue")({
  beforeLoad: () => {
    throw redirect({ to: "/patient/appointments", search: { book: 1 } as never });
  },
  component: Join,
});
export function Join() {
  return (
    <>
      <PageHeader
        title="Book an appointment"
        sub="Your token is created automatically when you book."
      />
      <Link to="/patient/appointments" search={{ book: 1 } as never}>
        <Btn>Book appointment</Btn>
      </Link>
    </>
  );
}
