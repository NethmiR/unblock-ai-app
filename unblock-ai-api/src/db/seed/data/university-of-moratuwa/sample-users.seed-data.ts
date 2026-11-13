import { Permission } from "../../../../data/constants/permission.constant.js";
import { toSampleUserSeeds } from "../../../../utils/seed/sample-user-seed.util.js";
import type { SampleUserSeed } from "../../../../lib/types/seed/sample-user-seed.type.js";

const { WORKFLOW_MANAGE, TASK_CREATE, TASK_APPROVE, USER_MANAGE, ORGANISATION_MANAGE } = Permission;

export const UNIVERSITY_OF_MORATUWA_SAMPLE_USERS: readonly SampleUserSeed[] = toSampleUserSeeds([
  {
    fullName: "Ananda Wickramasinghe",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [
      { organisationalUnitCode: "VCO", designationCodes: ["vice_chancellor"] },
      { organisationalUnitCode: "FOE", designationCodes: [] },
      { organisationalUnitCode: "CE", designationCodes: ["senior_professor"] },
    ],
  },
  {
    fullName: "Dilrukshi Fernando",
    permissions: [USER_MANAGE, ORGANISATION_MANAGE, TASK_APPROVE],
    memberships: [{ organisationalUnitCode: "REGO", designationCodes: ["registrar"] }],
  },
  {
    fullName: "Ruwan Jayasekara",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [
      { organisationalUnitCode: "FOE", designationCodes: ["dean"] },
      { organisationalUnitCode: "ME", designationCodes: ["professor"] },
    ],
  },
  {
    fullName: "Chamari Gunawardena",
    permissions: [TASK_CREATE, TASK_APPROVE, WORKFLOW_MANAGE],
    memberships: [
      { organisationalUnitCode: "FOE", designationCodes: [] },
      { organisationalUnitCode: "CSE", designationCodes: ["head_of_department", "senior_lecturer_grade_i"] },
    ],
  },
  {
    fullName: "Nuwan Perera",
    permissions: [TASK_CREATE],
    memberships: [
      { organisationalUnitCode: "FOE", designationCodes: [] },
      { organisationalUnitCode: "CSE", designationCodes: ["lecturer"] },
      { organisationalUnitCode: "FIT", designationCodes: [] },
      { organisationalUnitCode: "IT", designationCodes: ["visiting_lecturer"] },
    ],
  },
  {
    fullName: "Ishara Bandara",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [
      { organisationalUnitCode: "FIT", designationCodes: [] },
      { organisationalUnitCode: "IT", designationCodes: ["senior_lecturer_grade_ii"] },
    ],
  },
  {
    fullName: "Sanduni Rajapaksha",
    permissions: [TASK_APPROVE, WORKFLOW_MANAGE],
    memberships: [
      { organisationalUnitCode: "FOE", designationCodes: ["senior_assistant_registrar"] },
      { organisationalUnitCode: "EXAM", designationCodes: [] },
    ],
  },
  {
    fullName: "Kasun Herath",
    permissions: [TASK_APPROVE],
    memberships: [{ organisationalUnitCode: "FIN", designationCodes: ["bursar"] }],
  },
  {
    fullName: "Tharindu Senanayake",
    permissions: [TASK_APPROVE, WORKFLOW_MANAGE],
    memberships: [
      { organisationalUnitCode: "CITES", designationCodes: ["director"] },
      { organisationalUnitCode: "FOE", designationCodes: [] },
      { organisationalUnitCode: "CSE", designationCodes: ["senior_lecturer_grade_ii"] },
    ],
  },
  {
    fullName: "Pradeep Kumara",
    permissions: [TASK_CREATE],
    memberships: [
      { organisationalUnitCode: "FOE", designationCodes: [] },
      { organisationalUnitCode: "ENTC", designationCodes: ["technical_officer"] },
    ],
  },
  {
    fullName: "Nadeesha Silva",
    permissions: [TASK_CREATE],
    memberships: [{ organisationalUnitCode: "EXAM", designationCodes: ["management_assistant"] }],
  },
  {
    fullName: "Hasitha Dissanayake",
    permissions: [TASK_CREATE],
    memberships: [
      { organisationalUnitCode: "FOE", designationCodes: [] },
      { organisationalUnitCode: "CSE", designationCodes: ["student"] },
    ],
  },
  {
    fullName: "Oshadi Liyanage",
    permissions: [TASK_CREATE],
    memberships: [{ organisationalUnitCode: "FGS", designationCodes: ["student"] }],
  },
  {
    fullName: "Malith Abeysinghe",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [
      { organisationalUnitCode: "FOA", designationCodes: [] },
      { organisationalUnitCode: "ARCH", designationCodes: ["head_of_department", "senior_lecturer_grade_ii"] },
    ],
  },
  {
    fullName: "Rashmi Weerasinghe",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [{ organisationalUnitCode: "FOE-UGSD", designationCodes: ["assistant_registrar"] }],
  },
  {
    fullName: "Lahiru Ekanayake",
    permissions: [TASK_CREATE],
    memberships: [],
  },
  {
    fullName: "Kavindu Jayawardena",
    permissions: [TASK_CREATE],
    memberships: [
      { organisationalUnitCode: "FIT", designationCodes: [] },
      { organisationalUnitCode: "IT", designationCodes: ["student"] },
    ],
  },
  {
    fullName: "Sunethra Ratnayake",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [{ organisationalUnitCode: "FIT", designationCodes: ["dean"] }],
  },
  {
    fullName: "Dinesh Wijesinghe",
    permissions: [TASK_CREATE, TASK_APPROVE],
    memberships: [
      { organisationalUnitCode: "FIT", designationCodes: [] },
      { organisationalUnitCode: "IT", designationCodes: ["head_of_department", "senior_lecturer_grade_i"] },
    ],
  },
]);
