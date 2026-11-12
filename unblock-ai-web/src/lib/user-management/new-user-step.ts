export enum NewUserQueryParam {
  USER = "user",
  STEP = "step",
}

export enum NewUserStep {
  ACCOUNT = "account",
  AFFILIATIONS = "affiliations",
  DONE = "done",
}

export const NEW_USER_STEP_ORDER: readonly NewUserStep[] = [NewUserStep.ACCOUNT, NewUserStep.AFFILIATIONS, NewUserStep.DONE];

export function resolveNewUserStep(userId: string | null, step: string | null): NewUserStep {
  if (userId === null) return NewUserStep.ACCOUNT;
  return step === NewUserStep.DONE ? NewUserStep.DONE : NewUserStep.AFFILIATIONS;
}
