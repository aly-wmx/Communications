export const ROLES = ["admin", "manager", "coordinator"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  coordinator: "Coordinator",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything, including Team, Businesses and Settings.",
  manager: "Everything except Team, Businesses and Settings. Receives escalations.",
  coordinator: "Queue, clients, call log and announcements. Can reply to clients and escalate.",
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** CSV downloads of client data: managers and admins only. */
export function canExport(role: Role): boolean {
  return role === "admin" || role === "manager";
}

/** Everyone on the team can message clients (coordinators answer most of them). */
export function canSendMessages(role: Role): boolean {
  return isRole(role);
}
