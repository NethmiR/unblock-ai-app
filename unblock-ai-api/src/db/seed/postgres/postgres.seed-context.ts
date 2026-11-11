import type { UserService } from "../../../services/user.service.js";
import type { SeedConfig } from "../../../lib/types/config/config.type.js";

export interface PostgresSeedContext {
  userService: UserService;
  seedConfig: SeedConfig;
}
