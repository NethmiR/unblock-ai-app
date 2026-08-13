/**
 * MOCK AUTHENTICATION - REPLACE BEFORE ANY DEPLOYMENT.
 *
 * This exists as a SEAM, not as a feature. Every component reads identity
 * through `getSession()`, so swapping in NextAuth later means rewriting this
 * one file and nothing else. The values match the mockups so screenshots and
 * the running app agree.
 */
export interface Session {
  id: string;
  name: string;
  initials: string;
  role: "admin" | "requester";
  department: string;
  organisation: string;
  faculty: string | null;
}

const MOCK_SESSIONS: Record<Session["role"], Session> = {
  admin: {
    id: "admin-1",
    name: "Nadeesha Perera",
    initials: "NP",
    role: "admin",
    department: "Registrar's Office",
    organisation: "University of Colombo School of Computing",
    faculty: null,
  },
  requester: {
    id: "user-1",
    name: "Chathura Silva",
    initials: "CS",
    role: "requester",
    department: "Department of Information Technology",
    organisation: "University of Colombo School of Computing",
    faculty: "Information Technology",
  },
};

export function getSession(role: Session["role"] = "admin"): Session {
  return MOCK_SESSIONS[role];
}

/**
 * Context handed to the selector so it can skip questions it can already answer.
 * When a requester's faculty is known, "Which faculty are you in?" is a question
 * the system should never have to ask.
 */
export function getRequesterContext(session: Session) {
  return { faculty: session.faculty, department: session.department, actor_type: "staff" };
}
