import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { BillingWorkspace } from "@/components/billing-workspace";
export const Route = createFileRoute("/patient/billing")({
  component: () => (
    <>
      <PageHeader title="My billing" sub="Your invoices, balances and payment history." />
      <BillingWorkspace portal />
    </>
  ),
});
