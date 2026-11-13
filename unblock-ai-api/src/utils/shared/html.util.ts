const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_SPECIAL_CHARACTERS = /[&<>"']/g;

export function escapeHtml(text: string): string {
  return text.replace(HTML_SPECIAL_CHARACTERS, (character) => HTML_ESCAPES[character] ?? character);
}
