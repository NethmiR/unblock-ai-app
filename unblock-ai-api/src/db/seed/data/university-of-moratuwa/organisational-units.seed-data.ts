import { OrganisationalUnitType } from "../../../../data/constants/organisational-unit.constant.js";
import type { OrganisationalUnitSeed } from "../../../../lib/types/seed/organisation-seed.type.js";

const { FACULTY, DEPARTMENT, DIVISION } = OrganisationalUnitType;

function department(code: string, name: string): OrganisationalUnitSeed {
  return { code, name: `Department of ${name}`, unitType: DEPARTMENT };
}

function division(code: string, name: string): OrganisationalUnitSeed {
  return { code, name, unitType: DIVISION };
}

export const UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS: readonly OrganisationalUnitSeed[] = [
  {
    code: "FOA",
    name: "Faculty of Architecture",
    unitType: FACULTY,
    children: [
      department("ARCH", "Architecture"),
      department("BE", "Building Economics"),
      department("ID", "Integrated Design"),
      department("TCP", "Town & Country Planning"),
      department("FM", "Facilities Management"),
      division("FOA-UGSD", "Undergraduate Studies Division"),
      division("FOA-PGSD", "Postgraduate Studies Division"),
    ],
  },
  {
    code: "FOB",
    name: "Faculty of Business",
    unitType: FACULTY,
    children: [
      department("DS", "Decision Sciences"),
      department("IM", "Industrial Management"),
      department("MOT", "Management of Technology"),
    ],
  },
  {
    code: "FOE",
    name: "Faculty of Engineering",
    unitType: FACULTY,
    children: [
      department("CPE", "Chemical & Process Engineering"),
      department("CE", "Civil Engineering"),
      department("CSE", "Computer Science & Engineering"),
      department("ERE", "Earth Resources Engineering"),
      department("EE", "Electrical Engineering"),
      department("ENTC", "Electronic & Telecommunication Engineering"),
      department("MSE", "Materials Science & Engineering"),
      department("ME", "Mechanical Engineering"),
      department("TAE", "Textile & Apparel Engineering"),
      department("TLM", "Transport Management & Logistics Engineering"),
      department("MATH", "Mathematics"),
      division("FOE-UGSD", "Undergraduate Studies Division"),
      division("FOE-PGSD", "Postgraduate Studies Division"),
      division("FOE-ITD", "Industrial Training Division"),
    ],
  },
  {
    code: "FGS",
    name: "Faculty of Graduate Studies",
    unitType: FACULTY,
  },
  {
    code: "FIT",
    name: "Faculty of Information Technology",
    unitType: FACULTY,
    children: [
      department("IT", "Information Technology"),
      department("CM", "Computational Mathematics"),
      department("IDS", "Interdisciplinary Studies"),
    ],
  },
  {
    code: "FOM",
    name: "Faculty of Medicine",
    unitType: FACULTY,
    children: [
      department("ANAT", "Anatomy"),
      department("BCC", "Biochemistry & Clinical Chemistry"),
      department("PHYSIO", "Physiology"),
      department("PHARM", "Pharmacology"),
      department("MPARA", "Microbiology & Parasitology"),
      department("CFM", "Community & Family Medicine"),
      department("PFM", "Pathology & Forensic Medicine"),
      department("MMH", "Medicine & Mental Health"),
      department("SURG", "Surgery & Anaesthesia"),
      department("OBGYN", "Obstetrics & Gynaecology"),
      department("PAED", "Paediatrics & Neonatology"),
      department("MEDED", "Medical Education"),
      department("MEDTECH", "Medical Technology"),
    ],
  },
  division("VCO", "Office of the Vice-Chancellor"),
  division("REGO", "Office of the Registrar"),
  division("ESTA", "Establishments Division (Academic)"),
  division("ESTN", "Establishments Division (Non-Academic)"),
  division("EXAM", "Examinations & Registration Division"),
  division("FIN", "Finance Division"),
  division("SWD", "Student Welfare Division"),
  division("SUP", "Supplies Division"),
  division("CWP", "Capital Works & Planning Division"),
  division("LIB", "Library"),
  division("CITES", "Centre for IT Services"),
  division("RES", "Office of Research"),
  division("SDC", "Staff Development Centre"),
  division("CGU", "Career Guidance Unit"),
  division("SCU", "Student Counselling Unit"),
  division("PED", "Physical Education Division"),
  division("UMC", "University Medical Centre"),
];
