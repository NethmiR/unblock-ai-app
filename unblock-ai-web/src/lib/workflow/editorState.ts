export type EditorState = "empty" | "typed" | "generated" | "edited";

/**
 * Derives the editor state from three facts. A single derived value beats four
 * booleans that can contradict each other - "generated AND empty" is not a
 * state this function can produce.
 */
export function deriveEditorState({
  text, hasCompiled, compiledFromText,
}: { text: string; hasCompiled: boolean; compiledFromText: string | null }): EditorState {
  if (text.trim() === "") return "empty";
  if (!hasCompiled) return "typed";
  return text === compiledFromText ? "generated" : "edited";
}

/** The CTA label and enabled-ness fall out of the state. */
export function ctaFor(state: EditorState) {
  switch (state) {
    case "empty":     return { label: "Generate template",   enabled: false };
    case "typed":     return { label: "Generate template",   enabled: true };
    case "generated": return { label: "Regenerate template", enabled: false };
    case "edited":    return { label: "Regenerate template", enabled: true };
  }
}
