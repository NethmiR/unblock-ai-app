"use client";
import { CheckboxGroup } from "@/components/ui/form/CheckboxGroup";
import { PERMISSION_DESCRIPTIONS, PERMISSION_LABELS } from "@/lib/auth/permission-label";
import { PERMISSIONS, type Permission } from "@/types/permission";

const PERMISSION_OPTIONS = PERMISSIONS.map((permission) => ({
  value: permission,
  label: PERMISSION_LABELS[permission],
  description: PERMISSION_DESCRIPTIONS[permission],
}));

interface PermissionCheckboxGroupProps {
  legend: string;
  values: readonly Permission[];
  onValuesChange: (values: Permission[]) => void;
  error?: string | null;
  disabled?: boolean;
}

export function PermissionCheckboxGroup({ legend, values, onValuesChange, error, disabled }: PermissionCheckboxGroupProps) {
  return (
    <CheckboxGroup
      legend={legend}
      options={PERMISSION_OPTIONS}
      values={values}
      onValuesChange={onValuesChange}
      error={error}
      columns={2}
      disabled={disabled}
    />
  );
}
