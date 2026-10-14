export const ROLES = ["admin", "manager", "coordinator"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  coordinator: "Coordinator",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything, including Team, Businesses and Settings.",
  manager: "Everything except Team, Businesses and Settings. Can export client data. Usually receives escalations.",
  coordinator: "Inbox, escalations, team chat, call log and reports. Replies to clients (once allowed) and escalates.",
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

// ---------- What each role can see and do ----------
// One list used by the sidebar and the "My access" page, so what people are
// told always matches what the app shows. The real enforcement stays in the
// server actions and database rules; tests keep this list in step with them.

const ALL: readonly Role[] = ROLES;
const MANAGERS: readonly Role[] = ["admin", "manager"];
const ADMINS: readonly Role[] = ["admin"];

/** Where a page sits in the sidebar. "inbox" pages aren't in the sidebar; they're reached from the Inbox. */
export type PageGroup = "work" | "insights" | "you" | "admin" | "inbox";

export const GROUP_LABELS: Record<Exclude<PageGroup, "inbox">, string> = {
  work: "Work",
  insights: "Insights",
  you: "You",
  admin: "Admin",
};

export interface PageAccess {
  href: string;
  group: PageGroup;
  label: string;
  roles: readonly Role[];
  description: string;
}

export const PAGES: readonly PageAccess[] = [
  { href: "/dashboard", group: "work", label: "Overview", roles: ALL, description: "What needs you now, team activity and this week's numbers." },
  { href: "/dashboard/inbox", group: "work", label: "Inbox", roles: ALL, description: "Every client conversation: texts, emails, calls and voicemails." },
  { href: "/dashboard/board", group: "work", label: "Board", roles: ALL, description: "Tickets and client items as To do, In progress, Waiting and Done." },
  { href: "/dashboard/escalations", group: "work", label: "Escalations", roles: ALL, description: "Clients who waited too long, as a table or a board." },
  { href: "/dashboard/team-chat", group: "work", label: "Team Chat", roles: ALL, description: "Internal notes and the team channel. Clients never see these." },
  { href: "/dashboard/calls", group: "work", label: "Call Log", roles: ALL, description: "Calls to and from clients, with recordings." },
  { href: "/dashboard/reports", group: "insights", label: "Reports", roles: ALL, description: "Response times and trends." },
  { href: "/dashboard/archived", group: "inbox", label: "Archived", roles: ALL, description: "Spam and archived clients (open it from the Inbox)." },
  { href: "/dashboard/notifications", group: "you", label: "Alert settings", roles: ALL, description: "How the portal reaches you: Slack, email, sound and desktop alerts." },
  { href: "/dashboard/access", group: "you", label: "My access", roles: ALL, description: "This page: what you can see and do." },
  { href: "/dashboard/team", group: "admin", label: "Team", roles: ADMINS, description: "Who can sign in, their roles, and who can send to clients." },
  { href: "/dashboard/businesses", group: "admin", label: "Businesses", roles: ADMINS, description: "Add and rename businesses." },
  { href: "/dashboard/settings", group: "admin", label: "Settings", roles: ADMINS, description: "Response targets, notifications, Slack, sign-in domains." },
];

export interface ActionAccess {
  label: string;
  roles: readonly Role[];
  /** Also depends on a switch on the person's Team record. */
  needs?: "can_send" | "escalation";
  note?: string;
}

export const ACTIONS: readonly ActionAccess[] = [
  { label: "See every client and conversation", roles: ALL, note: "Departments filter what you see first; they don't hide anything." },
  {
    label: "Reply to clients and start new conversations",
    roles: ALL,
    needs: "can_send",
    note: "Real texts and emails through GoHighLevel. Up to 60 an hour, and 10 new numbers or addresses an hour.",
  },
  { label: "Assign, resolve and reopen client items", roles: ALL },
  { label: "Escalate a client, and pick up an escalation", roles: ALL },
  { label: "Edit client details, stage and archive or mark as spam", roles: ALL },
  { label: "Log calls", roles: ALL },
  { label: "Create tickets, move them on the Board and comment", roles: ALL, note: "Anyone can take a ticket themselves." },
  { label: "Assign tickets to someone else", roles: MANAGERS },
  { label: "Post team notes, @mention and flag teammates", roles: ALL, note: "You can delete your own notes; admins can delete any." },
  { label: "Receive escalations", roles: ALL, needs: "escalation", note: "Whoever has “Escalations” ticked on the Team page." },
  { label: "Export client data to CSV", roles: MANAGERS },
  { label: "Delete a client permanently", roles: ADMINS },
  { label: "Manage the team, roles and who can send", roles: ADMINS },
  { label: "Change settings, notification rules and businesses", roles: ADMINS },
];

/** Managers and admins assign tickets to others; everyone else can only take one. Enforced by the tickets_guard_update trigger and insert policy. */
export const canAssignTickets = (role: Role): boolean => MANAGERS.includes(role);

export const canOpen = (role: Role, href: string): boolean => PAGES.find((p) => p.href === href)?.roles.includes(role) ?? false;
