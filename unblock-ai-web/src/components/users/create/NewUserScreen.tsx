"use client";
import { Stepper } from "@/components/ui/Stepper";
import { NewUserAffiliationsStep } from "./NewUserAffiliationsStep";
import { NewUserCompletion } from "./NewUserCompletion";
import { UserAccountForm } from "./UserAccountForm";
import { useQueryParams } from "@/lib/hooks/useQueryParams";
import { NEW_USER_STEP_ORDER, NewUserQueryParam, NewUserStep, resolveNewUserStep } from "@/lib/user-management/new-user-step";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";

const COPY = USER_MANAGEMENT_COPY.create;

export function NewUserScreen() {
  const params = useQueryParams<NewUserQueryParam>();
  const userId = params.get(NewUserQueryParam.USER);
  const step = resolveNewUserStep(userId, params.get(NewUserQueryParam.STEP));

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <Stepper label={COPY.stepperLabel} steps={COPY.steps} currentIndex={NEW_USER_STEP_ORDER.indexOf(step)} />

      {step === NewUserStep.ACCOUNT && (
        <UserAccountForm onCreated={(user) => params.set({ [NewUserQueryParam.USER]: user.id, [NewUserQueryParam.STEP]: null })} />
      )}
      {step === NewUserStep.AFFILIATIONS && userId !== null && (
        <NewUserAffiliationsStep userId={userId} onFinished={() => params.set({ [NewUserQueryParam.STEP]: NewUserStep.DONE })} />
      )}
      {step === NewUserStep.DONE && userId !== null && <NewUserCompletion userId={userId} />}
    </div>
  );
}
