import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { BillingWorkspace } from "@/components/billing-workspace";
export const Route = createFileRoute("/admin/billing")({
  component: () => (
    <>
      <PageHeader title="Billing" sub="Clinic invoices, balances and recorded payments." />
      <BillingWorkspace />
    </>
  ),
});
