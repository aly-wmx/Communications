"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  MessagesSquare,
  Phone,
  Settings,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { GROUP_LABELS, PAGES, type PageAccess, type PageGroup, type Role } from "@/lib/roles";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/inbox": Inbox,
  "/dashboard/board": KanbanSquare,
  "/dashboard/escalations": Siren,
  "/dashboard/team-chat": MessagesSquare,
  "/dashboard/calls": Phone,
  "/dashboard/reports": BarChart3,
  "/dashboard/notifications": SlidersHorizontal,
  "/dashboard/access": ShieldCheck,
  "/dashboard/team": Users,
  "/dashboard/businesses": Building2,
  "/dashboard/settings": Settings,
};

// From the shared access list, so the menu matches what "My access" tells people.
const SECTIONS = (Object.keys(GROUP_LABELS) as Array<Exclude<PageGroup, "inbox">>).map((group) => ({
  group,
  label: GROUP_LABELS[group],
  pages: PAGES.filter((p) => p.group === group),
}));

export function DashboardNav({
  role,
  queueBadge,
  boardBadge,
  escalationBadge,
}: {
  role: Role;
  queueBadge: number;
  /** Your open tickets. */
  boardBadge: number;
  escalationBadge: number;
}) {
  const pathname = usePathname();

  const link = (tab: PageAccess) => {
    // "/dashboard" must match exactly, or it would be active on every nested route.
    const active = tab.href === "/dashboard" ? pathname === tab.href : pathname.startsWith(tab.href);
    const count =
      tab.href === "/dashboard/inbox" ? queueBadge : tab.href === "/dashboard/board" ? boardBadge : tab.href === "/dashboard/escalations" ? escalationBadge : 0;
    const badge = count > 0 ? count : null;
    const Icon = ICONS[tab.href];
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-10 items-center gap-2.5 rounded-md border-l-2 px-3 text-sm font-medium transition-colors lg:min-h-9 ${
          active ? "border-gold bg-gold/7 text-navy" : "border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        }`}
      >
        {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
        <span className="flex-1">{tab.label}</span>
        {badge && (
          <span
            className={`rounded-full px-1.5 text-[11px] font-semibold ${
              tab.href === "/dashboard/escalations" ? "bg-red-600 text-white" : "bg-zinc-200 text-zinc-700"
            }`}
            aria-label={tab.href === "/dashboard/inbox" ? `${badge} need you` : tab.href === "/dashboard/board" ? `${badge} open tickets of yours` : `${badge} need attention`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col overflow-y-auto p-3" aria-label="Sections">
      {SECTIONS.map(({ group, label, pages }) => {
        const visible = pages.filter((p) => p.roles.includes(role));
        if (!visible.length) return null;
        return (
          <div key={group} className="mb-3 flex flex-col gap-0.5">
            {/* "Work" is the obvious default; headings start from the second group. */}
            {group !== "work" && (
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
            )}
            {visible.map(link)}
          </div>
        );
      })}
    </nav>
  );
}
