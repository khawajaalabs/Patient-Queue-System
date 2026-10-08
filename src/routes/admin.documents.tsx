import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/qc";
import { DocumentsPanel } from "@/components/documents-panel";
export const Route = createFileRoute("/admin/documents")({
  component: () => (
    <>
      <PageHeader
        title="Patient documents"
        sub="Private reports and files, released only when authorized."
      />
      <DocumentsPanel />
    </>
  ),
});
