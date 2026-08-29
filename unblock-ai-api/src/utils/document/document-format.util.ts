// ISO-based, not toLocaleString: the renderer must produce byte-identical output for the
// same CompletionDocument (D-4), and locale-dependent formatting varies across environments.
export function formatDocumentDate(date: Date): string {
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
