export enum AssigneeSource {
  DIRECTORY = "directory",
  REQUESTER_CHOICE = "requester_choice",
  REQUESTER_SUPPLIED = "requester_supplied",
  REQUESTER = "requester",
  SYSTEM = "system",
}

export enum AssigneeResolutionNote {
  NOT_A_DESIGNATION = "not_a_designation",
  NO_HOLDER = "no_holder",
  MULTIPLE_HOLDERS = "multiple_holders",
  HOLDER_IS_REQUESTER = "holder_is_requester",
  RESOLVED_BY_FALLBACK = "resolved_by_fallback",
}

export const ASSIGNEE_OPTION_DESCRIPTION_SEPARATOR = " · ";
