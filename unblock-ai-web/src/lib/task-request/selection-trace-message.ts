import { TASK_REQUEST_COPY } from "./task-request-copy";
import { IconName } from "@/types/icon";
import { SelectionTraceStep, type SelectionTraceEntryDto } from "@/types/selection";

const TRACE = TASK_REQUEST_COPY.trace;

function titlesOrCount(entry: SelectionTraceEntryDto): string {
  return entry.workflow_template_titles.length > 0 ? entry.workflow_template_titles.join(", ") : TRACE.excludedCount(entry.count);
}

export const SELECTION_TRACE_MESSAGES: Record<SelectionTraceStep, (entry: SelectionTraceEntryDto) => string> = {
  [SelectionTraceStep.PROFILE_READ]: () => TRACE.profileRead,
  [SelectionTraceStep.CANDIDATES_RETRIEVED]: (entry) => TRACE.candidatesRetrieved(entry.count),
  [SelectionTraceStep.CANDIDATES_REUSED]: (entry) => TRACE.candidatesReused(entry.count),
  [SelectionTraceStep.EXCLUDED_BY_AUDIENCE]: (entry) => TRACE.excludedByAudience(titlesOrCount(entry)),
  [SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE]: (entry) => TRACE.excludedByRequesterType(titlesOrCount(entry)),
  [SelectionTraceStep.SELECTOR_CONSULTED]: (entry) => TRACE.selectorConsulted(entry.count),
  [SelectionTraceStep.SELECTOR_NOT_NEEDED]: () => TRACE.selectorNotNeeded,
  [SelectionTraceStep.ROUND_LIMIT_REACHED]: () => TRACE.roundLimitReached,
};

export const SELECTION_TRACE_ICONS: Record<SelectionTraceStep, IconName> = {
  [SelectionTraceStep.PROFILE_READ]: IconName.PROFILE,
  [SelectionTraceStep.CANDIDATES_RETRIEVED]: IconName.SEARCH,
  [SelectionTraceStep.CANDIDATES_REUSED]: IconName.REFRESH,
  [SelectionTraceStep.EXCLUDED_BY_AUDIENCE]: IconName.ORGANISATION,
  [SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE]: IconName.USERS,
  [SelectionTraceStep.SELECTOR_CONSULTED]: IconName.LIGHTBULB,
  [SelectionTraceStep.SELECTOR_NOT_NEEDED]: IconName.CHECK,
  [SelectionTraceStep.ROUND_LIMIT_REACHED]: IconName.LIST,
};

export function selectionTraceMessage(entry: SelectionTraceEntryDto): string {
  return SELECTION_TRACE_MESSAGES[entry.step](entry);
}

export function hasAudienceExclusion(trace: readonly SelectionTraceEntryDto[]): boolean {
  return trace.some((entry) => entry.step === SelectionTraceStep.EXCLUDED_BY_AUDIENCE && entry.count > 0);
}
