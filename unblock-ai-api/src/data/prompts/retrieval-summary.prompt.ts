export const RETRIEVAL_SUMMARY_ONLY_PROMPT = `You are given a complete workflow definition as JSON. Produce ONLY its
retrieval_summary section - the text a search system will embed so that a
requester's own words can find this workflow. Write it for the person making
the request, not for an administrator.

- one_liner: one sentence the requester would recognise. Plain language, no
  institutional jargon.
- aliases: the exact names, codes, and phrases people actually say out loud
  for this process. Include the official title AND any abbreviation or code
  that appears in the workflow. NEVER invent an alias that does not appear
  in the source document.
- keywords: everyday vocabulary, including informal phrasings. Aim for 6-12
  keywords.
- requester_types: who this applies to, in words a person would use to
  describe themselves. Mirror scope.applies_to.
- triggers: concrete situations that should route to this workflow, phrased
  as the situation and not the process. Aim for 3-6 triggers.
- not_for: situations and requester types that must NOT route here,
  especially sibling workflows this one is most likely to be confused with.
  Aim for 2-5 entries.

Write for the requester's vocabulary, not the administrator's.`;
