export type ActorResolution = "dynamic" | "static" | "requester" | "system";

export interface Actor {
  resolution: ActorResolution;
  role: string | null;
  relative_to: string | null;
  directory_query: string | null;
  fallback_role: string | null;
  display_name: string | null;
}
