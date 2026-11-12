"use client";
import { useState, type FormEvent } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { FormField } from "@/components/ui/form/FormField";
import { TextInput } from "@/components/ui/form/TextInput";
import { PermissionCheckboxGroup } from "./PermissionCheckboxGroup";
import { apiErrorCode, apiErrorMessage } from "@/lib/api/api-error";
import { USERS_PATH, usersApi } from "@/lib/api/users";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";
import { isValidEmail, normalizeEmail } from "@/lib/user-management/user-account-validation";
import { Permission } from "@/types/permission";
import { UserErrorCode, type UserDto } from "@/types/user";

const COPY = USER_MANAGEMENT_COPY.create;

interface FieldErrors {
  fullName?: string;
  email?: string;
  permissions?: string;
}

export function UserAccountForm({ onCreated }: { onCreated: (user: UserDto) => void }) {
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([Permission.TASK_CREATE]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (fullName.trim() === "") errors.fullName = COPY.fullNameRequired;
    if (!isValidEmail(email)) errors.email = COPY.emailInvalid;
    if (permissions.length === 0) errors.permissions = COPY.permissionsRequired;
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const { user } = await usersApi.create({ full_name: fullName, email: normalizeEmail(email), permissions });
      await revalidateApiPaths(USERS_PATH);
      toast.success(COPY.accountCreated(user.full_name));
      onCreated(user);
    } catch (err) {
      const message = apiErrorMessage(err, COPY.createFailed);
      if (apiErrorCode(err) === UserErrorCode.EMAIL_ALREADY_REGISTERED) setFieldErrors({ email: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{COPY.accountTitle}</h2>
      <p className="mb-5 mt-1 text-[12.5px] leading-relaxed text-muted">{COPY.accountDescription}</p>

      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5" noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={COPY.fullNameLabel} required error={fieldErrors.fullName}>
            {(control) => (
              <TextInput
                {...control}
                autoFocus
                autoComplete="off"
                value={fullName}
                placeholder={COPY.fullNamePlaceholder}
                invalid={Boolean(fieldErrors.fullName)}
                onChange={(event) => setFullName(event.target.value)}
              />
            )}
          </FormField>
          <FormField label={COPY.emailLabel} required error={fieldErrors.email}>
            {(control) => (
              <TextInput
                {...control}
                type="email"
                autoComplete="off"
                value={email}
                placeholder={COPY.emailPlaceholder}
                invalid={Boolean(fieldErrors.email)}
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </FormField>
        </div>

        <PermissionCheckboxGroup
          legend={COPY.permissionsLabel}
          values={permissions}
          onValuesChange={setPermissions}
          error={fieldErrors.permissions}
          disabled={busy}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? COPY.creatingAccount : COPY.createAccount}
          </Button>
        </div>
      </form>
    </Card>
  );
}
