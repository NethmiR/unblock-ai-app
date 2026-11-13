import { buildRequesterProfile } from "../utils/requester/requester-profile.util.js";
import { userNotFound } from "../errors/user.error.js";
import type { IUserRepository } from "../repositories/user-repository/user-repository.interface.js";
import type { IUserAffiliationRepository } from "../repositories/user-affiliation-repository/user-affiliation-repository.interface.js";
import type { RequesterProfile } from "../lib/types/requester/requester.type.js";

export interface RequesterProfileServiceOptions {
  userRepository: Pick<IUserRepository, "findById">;
  userAffiliationRepository: Pick<IUserAffiliationRepository, "findMembershipsByUserId">;
}

export class RequesterProfileService {
  private readonly userRepository: Pick<IUserRepository, "findById">;
  private readonly userAffiliationRepository: Pick<IUserAffiliationRepository, "findMembershipsByUserId">;

  constructor({ userRepository, userAffiliationRepository }: RequesterProfileServiceOptions) {
    this.userRepository = userRepository;
    this.userAffiliationRepository = userAffiliationRepository;
  }

  async getProfile(userId: string): Promise<RequesterProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw userNotFound(userId);
    const memberships = await this.userAffiliationRepository.findMembershipsByUserId(userId);
    return buildRequesterProfile(user, memberships);
  }
}
