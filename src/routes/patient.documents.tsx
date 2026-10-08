import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { DocumentsPanel } from "@/components/documents-panel";
export const Route = createFileRoute("/patient/documents")({
  component: () => (
    <>
      <PageHeader title="My documents" sub="Reports and documents released by your doctor." />
      <DocumentsPanel portal />
    </>
  ),
});
