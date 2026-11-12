export const ORGANISATIONAL_UNIT_CODE_MAX_LENGTH = 24;
export const DESIGNATION_CODE_MAX_LENGTH = 64;

const ORGANISATIONAL_UNIT_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const DESIGNATION_CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export function normalizeOrganisationalUnitCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidOrganisationalUnitCode(code: string): boolean {
  return code.length <= ORGANISATIONAL_UNIT_CODE_MAX_LENGTH && ORGANISATIONAL_UNIT_CODE_PATTERN.test(code);
}

export function normalizeDesignationCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidDesignationCode(code: string): boolean {
  return code.length <= DESIGNATION_CODE_MAX_LENGTH && DESIGNATION_CODE_PATTERN.test(code);
}

export function suggestDesignationCode(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, DESIGNATION_CODE_MAX_LENGTH);
}
