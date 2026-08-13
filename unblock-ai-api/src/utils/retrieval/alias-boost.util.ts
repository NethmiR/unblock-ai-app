import type { BoostedCandidate, RetrievalCandidate } from "../../lib/types/selection/candidate.type.js";

export function applyAliasBoost(
  candidates: RetrievalCandidate[],
  userQuery: string,
  boost: number,
): BoostedCandidate[] {
  const haystack = userQuery.toLowerCase();

  return candidates
    .map((candidate) => {
      const matched = (candidate.aliases_lower ?? []).filter((alias) => haystack.includes(alias));

      return {
        ...candidate,
        score: candidate.score + (matched.length > 0 ? boost : 0),
        base_score: candidate.score,
        alias_hits: matched,
      };
    })
    .sort((a, b) => b.score - a.score);
}
