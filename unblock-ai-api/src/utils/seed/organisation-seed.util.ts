import type {
  FlattenedOrganisationalUnitSeed,
  OrganisationalUnitSeed,
} from "../../lib/types/seed/organisation-seed.type.js";

export function flattenOrganisationalUnitSeeds(
  seeds: readonly OrganisationalUnitSeed[],
  parentCode: string | null = null,
): FlattenedOrganisationalUnitSeed[] {
  return seeds.flatMap((seed) => [{ seed, parentCode }, ...flattenOrganisationalUnitSeeds(seed.children ?? [], seed.code)]);
}
