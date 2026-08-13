import type { BoostedCandidate } from "../../lib/types/selection/candidate.type.js";

export interface SelectorTranscriptTurn {
  role: "user" | "assistant";
  text: string;
}

export const SELECTOR_SYSTEM_PROMPT = `You help a person find the correct institutional workflow for what they are trying to do.

You are given the person's request and a short list of CANDIDATE workflows that a search system retrieved. Your job is to decide which candidate they mean, or to ask one clarifying question.

## Rules you must not break

1. You may ONLY choose a workflow_id that appears in the candidate list. Never invent one, never modify one, never combine two.

2. If two candidates differ on ONE attribute - faculty, requester type, staff vs student, local vs overseas - that attribute IS the question. Ask about the attribute, not about the workflow names.
   GOOD: "Which faculty are you attached to?"
   BAD:  "Did you mean 'IT Faculty Overseas Leave' or 'Engineering Faculty Overseas Leave'?"
   The person knows their own faculty. They do not know your workflow names.

3. Ask exactly ONE question at a time, and always supply concrete answer options.

4. Read the "Not for" line of every candidate carefully. It is the strongest disqualifying evidence you have. If the person's request matches something in a candidate's "Not for" list, that candidate is wrong even when its wording looks close.

5. If nothing genuinely fits, return "no_match". Do NOT stretch to the nearest option. A wrong workflow sends real approvals to the wrong people; an honest miss just asks the person to rephrase.

6. "matched" with "low" confidence is not allowed. If you are not at least moderately sure, return "ambiguous" and ask.

7. Use everything the person has already told you across the whole conversation, including answers to earlier clarifying questions.

## Output

Return only the structured object. \`reasoning\` is for engineers reading logs - be specific about which candidate attribute decided it. The person never sees \`reasoning\`.`;

export function renderCandidates(candidates: BoostedCandidate[]): string {
  return candidates
    .map((c, i) => {
      const s = c.retrieval_summary ?? ({} as NonNullable<BoostedCandidate["retrieval_summary"]>);
      const line = (label: string, arr: string[] | undefined): string =>
        arr?.length ? `\n   ${label}: ${arr.join(", ")}` : "";

      return [
        `${i + 1}. workflow_id: ${c.workflow_id}`,
        `   Title: ${c.title}`,
        `   What it is: ${s.one_liner ?? c.description ?? "(no summary)"}`,
        line("Also known as", s.aliases),
        line("Applies to", s.requester_types),
        line("Use when", s.triggers),
        line("NOT FOR", s.not_for),
        `\n   (retrieval score: ${c.score.toFixed(3)})`,
      ].join("");
    })
    .join("\n\n");
}

export function buildSelectorMessages({
  candidates,
  transcript,
}: {
  candidates: BoostedCandidate[];
  transcript: SelectorTranscriptTurn[];
}): Array<{ role: "system" | "user"; content: string }> {
  const conversation = transcript.map((turn) => `${turn.role === "user" ? "Person" : "You asked"}: ${turn.text}`).join("\n");

  return [
    { role: "system", content: SELECTOR_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "## Conversation so far",
        conversation,
        "",
        "## Candidate workflows",
        renderCandidates(candidates),
        "",
        "Decide now.",
      ].join("\n"),
    },
  ];
}
