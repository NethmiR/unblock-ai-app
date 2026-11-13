import type { IDesignationRepository } from "../repositories/designation-repository/designation-repository.interface.js";
import type { IOrganisationalUnitRepository } from "../repositories/organisational-unit-repository/organisational-unit-repository.interface.js";
import type { OrganisationCatalogue } from "../lib/types/organisation/organisation-catalogue.type.js";

export interface OrganisationCatalogueServiceOptions {
  organisationalUnitRepository: IOrganisationalUnitRepository;
  designationRepository: IDesignationRepository;
}

export class OrganisationCatalogueService {
  private readonly organisationalUnitRepository: IOrganisationalUnitRepository;
  private readonly designationRepository: IDesignationRepository;

  constructor({ organisationalUnitRepository, designationRepository }: OrganisationCatalogueServiceOptions) {
    this.organisationalUnitRepository = organisationalUnitRepository;
    this.designationRepository = designationRepository;
  }

  async getCatalogue(): Promise<OrganisationCatalogue> {
    const [units, designations] = await Promise.all([
      this.organisationalUnitRepository.list({ unitType: null, parentId: null, rootOnly: false, includeArchived: false }),
      this.designationRepository.list(false),
    ]);
    return {
      units,
      designations,
      unitsByCode: new Map(units.map((unit) => [unit.code, unit])),
      designationsByCode: new Map(designations.map((designation) => [designation.code, designation])),
    };
  }
}
