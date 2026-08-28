import { TemplateEditor } from "@/components/admin/TemplateEditor";

export default function NewTemplatePage() {
  // No `initialTitle`: a template that has never compiled has no name yet. The
  // heading shows a placeholder, and leaving it blank lets the model pick one
  // from the prose at generate time.
  return <TemplateEditor />;
}
