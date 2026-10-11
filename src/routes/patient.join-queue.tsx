import { createFileRoute, Link } from "@tanstack/react-router";
import { Btn, PageHeader } from "@/components/qc";
export const Route = createFileRoute("/patient/join-queue")({ component: Join });
export function Join() {
  return (
    <>
      <PageHeader
        title="Book an appointment"
        sub="Your token is created automatically when you book."
      />
      <Link to="/patient/appointments" search={{ book: "1" } as never}>
        <Btn>Book appointment</Btn>
      </Link>
    </>
  );
}
