import { LlmMessageRole } from "../constants/llm.constant.js";
import { RequesterProfileFactKind } from "../constants/requester.constant.js";
import type { LlmConversationRole, LlmMessage } from "../../lib/types/ai/llm.type.js";
import type { RequesterProfileFact } from "../../lib/types/requester/requester.type.js";
import type { SelectorCandidate } from "../../lib/types/selection/candidate.type.js";

export interface SelectorTranscriptTurn {
  role: LlmConversationRole;
  text: string;
}

export interface SelectorMessagesInput {
  candidates: readonly SelectorCandidate[];
  transcript: readonly SelectorTranscriptTurn[];
  facts: readonly RequesterProfileFact[];
  matchedCandidate: SelectorCandidate | null;
}

export const SELECTOR_FALLBACK_QUESTION = {
  UNCLEAR: "Could you describe what you need in a bit more detail?",
  WHICH_SITUATION: "Which of these best describes your situation?",
  WHICH_NEED: "Which of these best describes what you need?",
} as const;

export const SELECTOR_TRANSCRIPT_MATCHED_PREFIX = "Suggested workflow:";

const ALL_UNITS = "any faculty, department or division";
const NO_PROFILE = "(the directory has no affiliations for this person)";

export const SELECTOR_SYSTEM_PROMPT = `You help a person find the correct institutional workflow for what they are trying to do.

You are given the person's request, facts about the person from the institution's directory, and a short list of CANDIDATE workflows that a search system retrieved. Your job is to decide which candidate they mean, or to ask one clarifying question.

## Rules you must not break

1. You may ONLY choose a workflow_template_id that appears in the candidate list. Never invent one, never modify one, never combine two.

2. The requester profile facts are authoritative. Never ask about anything a fact already answers (their faculty, department, division or whether they are a student or staff member). Candidate audiences have already been filtered to this person, so a candidate you see is one they are allowed to start.

3. When candidates still differ, prefer asking about purpose (local vs overseas, leave vs travel, event vs purchase) rather than identity. Ask about the attribute, not about the workflow names.
   GOOD: "Are you travelling overseas or staying in the country?"
   BAD:  "Did you mean 'IT Faculty Overseas Leave' or 'Engineering Faculty Overseas Leave'?"

4. Ask exactly ONE question at a time, and always supply concrete answer options.

5. Read the "NOT FOR" line of every candidate carefully. It is the strongest disqualifying evidence you have. If the person's request matches something in a candidate's "NOT FOR" list, that candidate is wrong even when its wording looks close.

6. If nothing genuinely fits, return "no_match". Do NOT stretch to the nearest option. A wrong workflow sends real approvals to the wrong people; an honest miss just asks the person to rephrase.

7. "matched" with "low" confidence is not allowed. If you are not at least moderately sure, return "ambiguous" and ask.

8. Use everything the person has already told you across the whole conversation, including answers to earlier clarifying questions.

9. When a workflow is currently suggested and the person confirms they want to start it (for example "start the task", "yes, go ahead"), return "start_requested" with that workflow's id. If they instead refine or change their request, decide again as usual.

10. In matched_fact_ids, return the ids of the profile facts (P1, P2, ...) that decided the match. Only use ids that were given. Return an empty array when no fact mattered.

## Output

Return only the structured object. \`reasoning\` is for engineers reading logs - be specific about which candidate attribute decided it. The person never sees \`reasoning\`.`;

function renderFact(fact: RequesterProfileFact): string {
  const unit = fact.parent ? `${fact.unit.name} (${fact.parent.name})` : fact.unit.name;
  switch (fact.kind) {
    case RequesterProfileFactKind.MEMBER_OF_UNIT:
      return `${fact.id}: Member of ${unit}`;
    case RequesterProfileFactKind.HOLDS_DESIGNATION:
      return `${fact.id}: Holds ${fact.designation?.title ?? ""} in ${unit}`;
  }
}

export function renderProfileFacts(facts: readonly RequesterProfileFact[]): string {
  return facts.length > 0 ? facts.map(renderFact).join("\n") : NO_PROFILE;
}

export function renderCandidates(candidates: readonly SelectorCandidate[]): string {
  return candidates
    .map((candidate, index) => {
      const summary = candidate.retrieval_summary;
      const line = (label: string, values: readonly string[]): string => (values.length > 0 ? `\n   ${label}: ${values.join(", ")}` : "");
      const units = candidate.audience_unit_names.length > 0 ? candidate.audience_unit_names.join(", ") : ALL_UNITS;
      return [
        `${index + 1}. workflow_template_id: ${candidate.workflow_template_id}`,
        `\n   Title: ${candidate.title}`,
        `\n   What it is: ${summary.one_liner}`,
        `\n   Applies to: ${units}`,
        line("Requester types", summary.requester_types),
        line("Use when", summary.triggers),
        line("NOT FOR", summary.not_for),
      ].join("");
    })
    .join("\n\n");
}

function renderConversation(transcript: readonly SelectorTranscriptTurn[]): string {
  return transcript.map((turn) => `${turn.role === LlmMessageRole.USER ? "Person" : "You"}: ${turn.text}`).join("\n");
}

function renderSuggestion(candidate: SelectorCandidate | null): string[] {
  if (candidate === null) return [];
  return ["## Currently suggested workflow", `${candidate.workflow_template_id} — ${candidate.title}`, ""];
}

export function buildSelectorMessages({ candidates, transcript, facts, matchedCandidate }: SelectorMessagesInput): LlmMessage[] {
  return [
    { role: LlmMessageRole.SYSTEM, content: SELECTOR_SYSTEM_PROMPT },
    {
      role: LlmMessageRole.USER,
      content: [
        "## Conversation so far",
        renderConversation(transcript),
        "",
        "## Requester profile",
        renderProfileFacts(facts),
        "",
        ...renderSuggestion(matchedCandidate),
        "## Candidate workflows",
        renderCandidates(candidates),
        "",
        "Decide now.",
      ].join("\n"),
    },
  ];
}
