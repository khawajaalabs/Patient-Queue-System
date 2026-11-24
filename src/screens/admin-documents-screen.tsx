import { PageHeader } from "@/components/qc";
import { DocumentsPanel } from "@/components/documents-panel";

export function AdminDocuments() {
  return (
    <>
      <PageHeader
        title="Patient documents"
        sub="Private reports and files, released only when authorized."
      />
      <DocumentsPanel />
    </>
  );
}
