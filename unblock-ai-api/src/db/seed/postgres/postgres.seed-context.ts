import type { UserService } from "../../../services/user.service.js";
import type { OrganisationalUnitService } from "../../../services/organisational-unit.service.js";
import type { DesignationService } from "../../../services/designation.service.js";
import type { UserAffiliationService } from "../../../services/user-affiliation.service.js";
import type { SeedConfig } from "../../../lib/types/config/config.type.js";

export interface PostgresSeedContext {
  userService: UserService;
  organisationalUnitService: OrganisationalUnitService;
  designationService: DesignationService;
  userAffiliationService: UserAffiliationService;
  seedConfig: SeedConfig;
}
