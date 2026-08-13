/**
 * PLACEHOLDER DATA - NOT A BACKEND CALL.
 *
 * The workflow execution engine is out of scope for this phase, so there are no
 * real job instances to list. These fixtures exist so the screen can be built
 * and reviewed now. The shape matches the eventual API response exactly:
 * replacing this module with `jobsApi.list()` should require no component changes.
 *
 * DELETE THIS FILE when the execution engine ships.
 */
export type JobStatus = "in_progress" | "completed" | "rejected";

export interface Job {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  statusLabel: string;
  workflow_id: string;
  current_step: string | null;
  updated_at: string;
}

export const PLACEHOLDER_JOBS: Job[] = [
  {
    id: "leave",
    title: "Overseas Leave — 45 Days, Japan",
    description: "Academic Advisor → Head of Department → Dean. Waiting on Academic Advisor.",
    status: "in_progress", statusLabel: "In progress",
    workflow_id: "it_faculty_overseas_leave",
    current_step: "advisor_approval",
    updated_at: "2026-07-28T09:00:00Z",
  },
  {
    id: "letter",
    title: "Verification Letter — Enrolment Status",
    description: "Registry Office. Issued 28 July 2026, ready to download.",
    status: "completed", statusLabel: "Completed",
    workflow_id: "student_verification_letter",
    current_step: null,
    updated_at: "2026-07-28T14:20:00Z",
  },
  {
    id: "event",
    title: "Event Permission — IT Week Hackathon",
    description: "Student Affairs → Dean. Declined by the Dean on 12 July 2026 — venue capacity.",
    status: "rejected", statusLabel: "Rejected",
    workflow_id: "departmental_event_workshop",
    current_step: null,
    updated_at: "2026-07-12T11:00:00Z",
  },
];
