"use client";
import { useMemo, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { CodeChip } from "@/components/ui/CodeChip";
import { Combobox } from "@/components/ui/Combobox";
import { Drawer } from "@/components/ui/Drawer";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { FormField } from "@/components/ui/form/FormField";
import { TextArea } from "@/components/ui/form/TextArea";
import { TextInput } from "@/components/ui/form/TextInput";
import { apiErrorField } from "@/lib/api/api-error";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { ORGANISATIONAL_UNITS_PATH, organisationalUnitsApi } from "@/lib/api/organisational-units";
import { USERS_PATH } from "@/lib/api/users";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { isValidOrganisationalUnitCode, normalizeOrganisationalUnitCode } from "@/lib/organisation/code-format";
import { describeOrganisationError } from "@/lib/organisation/organisation-error-message";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { canHaveParent, requiresParent } from "@/lib/organisation/organisational-unit-hierarchy";
import { ORGANISATIONAL_UNIT_TYPE_LABELS } from "@/lib/organisation/organisational-unit-label";
import { toFacultyOptions } from "@/lib/organisation/organisational-unit-options";
import { UnitFormKind, type UnitFormMode } from "@/lib/organisation/unit-form-mode";
import type { OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

enum UnitFormField {
  NAME = "name",
  CODE = "code",
  PARENT = "parent_id",
  DESCRIPTION = "description",
}

type FieldErrors = Partial<Record<UnitFormField, string>>;

const FIELD_KEYS: readonly string[] = Object.values(UnitFormField);
const COPY = ORGANISATION_COPY.unitForm;

function isUnitFormField(field: string | null): field is UnitFormField {
  return field !== null && FIELD_KEYS.includes(field);
}

interface OrganisationalUnitFormDrawerProps {
  mode: UnitFormMode;
  units: readonly OrganisationalUnitSummaryDto[];
  onClose: () => void;
  onSaved: (unit: OrganisationalUnitSummaryDto) => void;
}

export function OrganisationalUnitFormDrawer({ mode, units, onClose, onSaved }: OrganisationalUnitFormDrawerProps) {
  const toast = useToast();
  const editing = mode.kind === UnitFormKind.EDIT ? mode.unit : null;
  const unitType = mode.kind === UnitFormKind.EDIT ? mode.unit.unit_type : mode.unitType;
  const typeLabel = ORGANISATIONAL_UNIT_TYPE_LABELS[unitType].singular;

  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState("");
  const [parentId, setParentId] = useState<string | null>(
    mode.kind === UnitFormKind.EDIT ? (mode.unit.parent?.id ?? null) : mode.parentId,
  );
  const [description, setDescription] = useState(editing?.description ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const facultyOptions = useMemo(() => {
    const options = toFacultyOptions(units);
    const currentParent = editing?.parent;
    return currentParent && !options.some((option) => option.value === currentParent.id)
      ? [{ value: currentParent.id, label: currentParent.name, meta: currentParent.code }, ...options]
      : options;
  }, [editing, units]);
  const selectedParentLabel = facultyOptions.find((option) => option.value === parentId)?.label ?? null;
  const idleLabel = editing ? COPY.save : COPY.create;
  const busyLabel = editing ? COPY.saving : COPY.creating;
  const submitLabel = busy ? busyLabel : idleLabel;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (name.trim() === "") errors[UnitFormField.NAME] = COPY.nameRequired;
    if (!editing && !isValidOrganisationalUnitCode(normalizeOrganisationalUnitCode(code))) errors[UnitFormField.CODE] = COPY.codeHint;
    if (requiresParent(unitType) && parentId === null) errors[UnitFormField.PARENT] = COPY.parentRequired;
    return errors;
  }

  async function submit(): Promise<void> {
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const parent = canHaveParent(unitType) ? parentId : null;
      const descriptionValue = description.trim() === "" ? null : description;
      const { organisational_unit: saved } = editing
        ? await organisationalUnitsApi.update(editing.id, { name, parent_id: parent, description: descriptionValue })
        : await organisationalUnitsApi.create({
            code: normalizeOrganisationalUnitCode(code),
            name,
            unit_type: unitType,
            parent_id: parent,
            description: descriptionValue,
          });
      await revalidateApiPaths(ORGANISATIONAL_UNITS_PATH, USERS_PATH);
      toast.success(editing ? COPY.updated(saved.name) : COPY.created(saved.name));
      onSaved(saved);
    } catch (err) {
      const message = describeOrganisationError(err, COPY.saveFailed);
      const field = apiErrorField(err);
      if (isUnitFormField(field)) setFieldErrors({ [field]: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={editing ? COPY.editTitle(editing.name) : COPY.createTitle(typeLabel)}
      description={editing ? COPY.editDescription : COPY.createDescription}
      busy={busy}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            {UI_COPY.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {formError && <InlineAlert>{formError}</InlineAlert>}

        <FormField label={COPY.nameLabel} required error={fieldErrors[UnitFormField.NAME]}>
          {(control) => (
            <TextInput
              {...control}
              autoFocus
              value={name}
              placeholder={COPY.namePlaceholder}
              invalid={Boolean(fieldErrors[UnitFormField.NAME])}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>

        {editing ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="font-semibold text-ink">{COPY.codeLabel}</span>
            <CodeChip code={editing.code} />
          </div>
        ) : (
          <FormField label={COPY.codeLabel} required hint={COPY.codeHint} error={fieldErrors[UnitFormField.CODE]}>
            {(control) => (
              <TextInput
                {...control}
                value={code}
                placeholder={COPY.codePlaceholder}
                autoCapitalize="characters"
                spellCheck={false}
                invalid={Boolean(fieldErrors[UnitFormField.CODE])}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="font-mono"
              />
            )}
          </FormField>
        )}

        {canHaveParent(unitType) && (
          <FormField
            label={COPY.parentLabel}
            required={requiresParent(unitType)}
            hint={requiresParent(unitType) ? undefined : COPY.parentOptionalHint}
            error={fieldErrors[UnitFormField.PARENT]}
          >
            {(control) => (
              <Combobox
                id={control.id}
                ariaDescribedBy={control["aria-describedby"]}
                placeholder={COPY.parentPlaceholder}
                options={facultyOptions}
                selectedValues={parentId ? [parentId] : []}
                valueLabel={selectedParentLabel}
                onSelect={setParentId}
                onClear={requiresParent(unitType) ? undefined : () => setParentId(null)}
                invalid={Boolean(fieldErrors[UnitFormField.PARENT])}
              />
            )}
          </FormField>
        )}

        <FormField label={COPY.descriptionLabel} error={fieldErrors[UnitFormField.DESCRIPTION]}>
          {(control) => (
            <TextArea
              {...control}
              value={description}
              placeholder={COPY.descriptionPlaceholder}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Drawer>
  );
}
