"use client";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { CodeChip } from "@/components/ui/CodeChip";
import { Drawer } from "@/components/ui/Drawer";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { CheckboxGroup } from "@/components/ui/form/CheckboxGroup";
import { FormField } from "@/components/ui/form/FormField";
import { Select } from "@/components/ui/form/Select";
import { Switch } from "@/components/ui/form/Switch";
import { TextInput } from "@/components/ui/form/TextInput";
import { apiErrorField } from "@/lib/api/api-error";
import { DESIGNATIONS_PATH, designationsApi } from "@/lib/api/designations";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { USERS_PATH } from "@/lib/api/users";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { isValidDesignationCode, normalizeDesignationCode, suggestDesignationCode } from "@/lib/organisation/code-format";
import { DESIGNATION_CATEGORY_LABELS } from "@/lib/organisation/designation-category-label";
import { describeOrganisationError } from "@/lib/organisation/organisation-error-message";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { ORGANISATIONAL_UNIT_TYPE_LABELS } from "@/lib/organisation/organisational-unit-label";
import { DESIGNATION_CATEGORIES, DesignationCategory, type DesignationSummaryDto } from "@/types/designation";
import { ORGANISATIONAL_UNIT_TYPES, type OrganisationalUnitType } from "@/types/organisational-unit";

enum DesignationFormField {
  TITLE = "title",
  CODE = "code",
  UNIT_TYPES = "applicable_unit_types",
  DISPLAY_ORDER = "display_order",
}

type FieldErrors = Partial<Record<DesignationFormField, string>>;

const FIELD_KEYS: readonly string[] = Object.values(DesignationFormField);
const COPY = ORGANISATION_COPY.designationForm;
const DISPLAY_ORDER_MAX = 9999;
const CATEGORY_OPTIONS = DESIGNATION_CATEGORIES.map((category) => ({ value: category, label: DESIGNATION_CATEGORY_LABELS[category] }));
const UNIT_TYPE_OPTIONS = ORGANISATIONAL_UNIT_TYPES.map((unitType) => ({
  value: unitType,
  label: ORGANISATIONAL_UNIT_TYPE_LABELS[unitType].plural,
}));

function isDesignationFormField(field: string | null): field is DesignationFormField {
  return field !== null && FIELD_KEYS.includes(field);
}

interface DesignationFormDrawerProps {
  designation: DesignationSummaryDto | null;
  nextDisplayOrder: number;
  onClose: () => void;
  onSaved: (designation: DesignationSummaryDto) => void;
}

export function DesignationFormDrawer({ designation, nextDisplayOrder, onClose, onSaved }: DesignationFormDrawerProps) {
  const toast = useToast();
  const [title, setTitle] = useState(designation?.title ?? "");
  const [code, setCode] = useState("");
  const [isCodeEdited, setIsCodeEdited] = useState(false);
  const [category, setCategory] = useState<DesignationCategory>(designation?.category ?? DesignationCategory.ACADEMIC);
  const [unitTypes, setUnitTypes] = useState<OrganisationalUnitType[]>(designation?.applicable_unit_types ?? []);
  const [singleHolder, setSingleHolder] = useState(designation?.single_holder_per_unit ?? false);
  const [displayOrder, setDisplayOrder] = useState(String(designation?.display_order ?? nextDisplayOrder));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveCode = isCodeEdited ? code : suggestDesignationCode(title);
  const idleLabel = designation ? COPY.save : COPY.create;
  const busyLabel = designation ? COPY.saving : COPY.creating;
  const submitLabel = busy ? busyLabel : idleLabel;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const order = Number(displayOrder);
    if (title.trim() === "") errors[DesignationFormField.TITLE] = COPY.titleRequired;
    if (!designation && !isValidDesignationCode(normalizeDesignationCode(effectiveCode))) errors[DesignationFormField.CODE] = COPY.codeHint;
    if (unitTypes.length === 0) errors[DesignationFormField.UNIT_TYPES] = COPY.unitTypesRequired;
    if (!Number.isInteger(order) || order < 0 || order > DISPLAY_ORDER_MAX) errors[DesignationFormField.DISPLAY_ORDER] = COPY.displayOrderHint;
    return errors;
  }

  async function submit(): Promise<void> {
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const fields = {
        title,
        category,
        applicable_unit_types: unitTypes,
        single_holder_per_unit: singleHolder,
        display_order: Number(displayOrder),
      };
      const { designation: saved } = designation
        ? await designationsApi.update(designation.id, fields)
        : await designationsApi.create({ ...fields, code: normalizeDesignationCode(effectiveCode) });
      await revalidateApiPaths(DESIGNATIONS_PATH, USERS_PATH);
      toast.success(designation ? COPY.updated(saved.title) : COPY.created(saved.title));
      onSaved(saved);
    } catch (err) {
      const message = describeOrganisationError(err, COPY.saveFailed);
      const field = apiErrorField(err);
      if (isDesignationFormField(field)) setFieldErrors({ [field]: message });
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={designation ? COPY.editTitle(designation.title) : COPY.createTitle}
      description={designation ? COPY.editDescription : COPY.createDescription}
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

        <FormField label={COPY.titleLabel} required error={fieldErrors[DesignationFormField.TITLE]}>
          {(control) => (
            <TextInput
              {...control}
              autoFocus
              value={title}
              placeholder={COPY.titlePlaceholder}
              invalid={Boolean(fieldErrors[DesignationFormField.TITLE])}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </FormField>

        {designation ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="font-semibold text-ink">{COPY.codeLabel}</span>
            <CodeChip code={designation.code} />
          </div>
        ) : (
          <FormField label={COPY.codeLabel} required hint={COPY.codeHint} error={fieldErrors[DesignationFormField.CODE]}>
            {(control) => (
              <TextInput
                {...control}
                value={effectiveCode}
                placeholder={COPY.codePlaceholder}
                spellCheck={false}
                invalid={Boolean(fieldErrors[DesignationFormField.CODE])}
                onChange={(event) => {
                  setIsCodeEdited(true);
                  setCode(event.target.value.toLowerCase());
                }}
                className="font-mono"
              />
            )}
          </FormField>
        )}

        <FormField label={COPY.categoryLabel} required>
          {(control) => <Select {...control} value={category} options={CATEGORY_OPTIONS} onValueChange={setCategory} />}
        </FormField>

        <CheckboxGroup
          legend={COPY.unitTypesLabel}
          options={UNIT_TYPE_OPTIONS}
          values={unitTypes}
          onValuesChange={setUnitTypes}
          columns={3}
          error={fieldErrors[DesignationFormField.UNIT_TYPES]}
        />

        <Switch
          checked={singleHolder}
          onCheckedChange={setSingleHolder}
          label={COPY.singleHolderLabel}
          description={COPY.singleHolderDescription}
        />

        <FormField label={COPY.displayOrderLabel} hint={COPY.displayOrderHint} error={fieldErrors[DesignationFormField.DISPLAY_ORDER]}>
          {(control) => (
            <TextInput
              {...control}
              type="number"
              inputMode="numeric"
              min={0}
              max={DISPLAY_ORDER_MAX}
              value={displayOrder}
              invalid={Boolean(fieldErrors[DesignationFormField.DISPLAY_ORDER])}
              onChange={(event) => setDisplayOrder(event.target.value)}
              className="sm:w-40"
            />
          )}
        </FormField>
      </div>
    </Drawer>
  );
}
