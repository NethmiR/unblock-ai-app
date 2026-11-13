import { TASK_REQUEST_COPY } from "./task-request-copy";
import { FormFieldIssueCode, type FormFieldIssueDto } from "@/types/task-form";

type IssueLimit = FormFieldIssueDto["limit"];

const ISSUES = TASK_REQUEST_COPY.fieldIssues;

function limitText(limit: IssueLimit): string {
  return limit === null ? ISSUES.limitFallback : String(limit);
}

export const TASK_FIELD_ISSUE_MESSAGES: Record<FormFieldIssueCode, (limit: IssueLimit) => string> = {
  [FormFieldIssueCode.REQUIRED]: () => ISSUES.required,
  [FormFieldIssueCode.UNKNOWN_FIELD]: () => ISSUES.unknownField,
  [FormFieldIssueCode.LOCKED]: () => ISSUES.locked,
  [FormFieldIssueCode.INVALID_TYPE]: () => ISSUES.invalidType,
  [FormFieldIssueCode.INVALID_EMAIL]: () => ISSUES.invalidEmail,
  [FormFieldIssueCode.INVALID_DATE]: () => ISSUES.invalidDate,
  [FormFieldIssueCode.INVALID_PHONE]: () => ISSUES.invalidPhone,
  [FormFieldIssueCode.TOO_SHORT]: (limit) => ISSUES.tooShort(limitText(limit)),
  [FormFieldIssueCode.TOO_LONG]: (limit) => ISSUES.tooLong(limitText(limit)),
  [FormFieldIssueCode.BELOW_MINIMUM]: (limit) => ISSUES.belowMinimum(limitText(limit)),
  [FormFieldIssueCode.ABOVE_MAXIMUM]: (limit) => ISSUES.aboveMaximum(limitText(limit)),
  [FormFieldIssueCode.BEFORE_EARLIEST_DATE]: (limit) => ISSUES.beforeEarliest(limitText(limit)),
  [FormFieldIssueCode.AFTER_LATEST_DATE]: (limit) => ISSUES.afterLatest(limitText(limit)),
  [FormFieldIssueCode.PATTERN_MISMATCH]: () => ISSUES.patternMismatch,
  [FormFieldIssueCode.NOT_AN_OPTION]: () => ISSUES.notAnOption,
};

export function taskFieldIssueMessage(issue: FormFieldIssueDto): string {
  return TASK_FIELD_ISSUE_MESSAGES[issue.code](issue.limit);
}

const ISSUE_CODES: ReadonlySet<string> = new Set(Object.values(FormFieldIssueCode));

function isIssueCode(code: unknown): code is FormFieldIssueCode {
  return typeof code === "string" && ISSUE_CODES.has(code);
}

export function parseFieldIssues(details: Record<string, unknown> | null): FormFieldIssueDto[] {
  const raw = details?.issues;
  if (!Array.isArray(raw)) return [];
  const issues: FormFieldIssueDto[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const fieldId: unknown = Reflect.get(item, "field_id");
    const code: unknown = Reflect.get(item, "code");
    const limit: unknown = Reflect.get(item, "limit");
    if (typeof fieldId !== "string" || !isIssueCode(code)) continue;
    issues.push({ field_id: fieldId, code, limit: typeof limit === "string" || typeof limit === "number" ? limit : null });
  }
  return issues;
}
