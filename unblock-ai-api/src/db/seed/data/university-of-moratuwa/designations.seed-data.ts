import { DesignationCategory } from "../../../../data/constants/designation.constant.js";
import { OrganisationalUnitType } from "../../../../data/constants/organisational-unit.constant.js";
import type { DesignationSeed } from "../../../../lib/types/seed/organisation-seed.type.js";

const { FACULTY, DEPARTMENT, DIVISION } = OrganisationalUnitType;
const { LEADERSHIP, ACADEMIC, ACADEMIC_SUPPORT, ADMINISTRATIVE, NON_ACADEMIC, STUDENT } = DesignationCategory;

const ACADEMIC_UNIT_TYPES = [FACULTY, DEPARTMENT];
const ADMINISTRATIVE_UNIT_TYPES = [FACULTY, DIVISION];

export const UNIVERSITY_OF_MORATUWA_DESIGNATIONS: readonly DesignationSeed[] = [
  { code: "vice_chancellor", title: "Vice-Chancellor", category: LEADERSHIP, applicableUnitTypes: [DIVISION], singleHolderPerUnit: true, displayOrder: 10 },
  { code: "deputy_vice_chancellor", title: "Deputy Vice-Chancellor", category: LEADERSHIP, applicableUnitTypes: [DIVISION], singleHolderPerUnit: true, displayOrder: 20 },
  { code: "registrar", title: "Registrar", category: LEADERSHIP, applicableUnitTypes: [DIVISION], singleHolderPerUnit: true, displayOrder: 30 },
  { code: "bursar", title: "Bursar", category: LEADERSHIP, applicableUnitTypes: [DIVISION], singleHolderPerUnit: true, displayOrder: 40 },
  { code: "librarian", title: "Librarian", category: LEADERSHIP, applicableUnitTypes: [DIVISION], singleHolderPerUnit: true, displayOrder: 50 },
  { code: "dean", title: "Dean", category: LEADERSHIP, applicableUnitTypes: [FACULTY], singleHolderPerUnit: true, displayOrder: 60 },
  { code: "head_of_department", title: "Head of Department", category: LEADERSHIP, applicableUnitTypes: [DEPARTMENT], singleHolderPerUnit: true, displayOrder: 70 },
  { code: "director", title: "Director", category: LEADERSHIP, applicableUnitTypes: [DIVISION], singleHolderPerUnit: true, displayOrder: 80 },

  { code: "senior_professor", title: "Senior Professor", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 100 },
  { code: "professor", title: "Professor", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 110 },
  { code: "senior_lecturer_grade_i", title: "Senior Lecturer (Grade I)", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 120 },
  { code: "senior_lecturer_grade_ii", title: "Senior Lecturer (Grade II)", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 130 },
  { code: "lecturer", title: "Lecturer", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 140 },
  { code: "lecturer_probationary", title: "Lecturer (Probationary)", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 150 },
  { code: "temporary_lecturer", title: "Temporary Lecturer", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 160 },
  { code: "visiting_lecturer", title: "Visiting Lecturer", category: ACADEMIC, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 170 },

  { code: "instructor", title: "Instructor", category: ACADEMIC_SUPPORT, applicableUnitTypes: [DEPARTMENT], singleHolderPerUnit: false, displayOrder: 200 },
  { code: "technical_officer", title: "Technical Officer", category: ACADEMIC_SUPPORT, applicableUnitTypes: [DEPARTMENT, DIVISION], singleHolderPerUnit: false, displayOrder: 210 },
  { code: "systems_analyst", title: "Systems Analyst", category: ACADEMIC_SUPPORT, applicableUnitTypes: [DIVISION], singleHolderPerUnit: false, displayOrder: 220 },
  { code: "assistant_librarian", title: "Assistant Librarian", category: ACADEMIC_SUPPORT, applicableUnitTypes: [DIVISION], singleHolderPerUnit: false, displayOrder: 230 },

  { code: "deputy_registrar", title: "Deputy Registrar", category: ADMINISTRATIVE, applicableUnitTypes: ADMINISTRATIVE_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 300 },
  { code: "senior_assistant_registrar", title: "Senior Assistant Registrar", category: ADMINISTRATIVE, applicableUnitTypes: ADMINISTRATIVE_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 310 },
  { code: "assistant_registrar", title: "Assistant Registrar", category: ADMINISTRATIVE, applicableUnitTypes: ADMINISTRATIVE_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 320 },
  { code: "deputy_bursar", title: "Deputy Bursar", category: ADMINISTRATIVE, applicableUnitTypes: ADMINISTRATIVE_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 330 },
  { code: "senior_assistant_bursar", title: "Senior Assistant Bursar", category: ADMINISTRATIVE, applicableUnitTypes: ADMINISTRATIVE_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 340 },
  { code: "assistant_bursar", title: "Assistant Bursar", category: ADMINISTRATIVE, applicableUnitTypes: ADMINISTRATIVE_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 350 },

  { code: "management_assistant", title: "Management Assistant", category: NON_ACADEMIC, applicableUnitTypes: [FACULTY, DEPARTMENT, DIVISION], singleHolderPerUnit: false, displayOrder: 400 },
  { code: "laboratory_attendant", title: "Laboratory Attendant", category: NON_ACADEMIC, applicableUnitTypes: [DEPARTMENT], singleHolderPerUnit: false, displayOrder: 410 },

  { code: "student", title: "Student", category: STUDENT, applicableUnitTypes: ACADEMIC_UNIT_TYPES, singleHolderPerUnit: false, displayOrder: 500 },
];
