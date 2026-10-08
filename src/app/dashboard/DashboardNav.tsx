"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/roles";

type Tab = { href: string; label: string; adminOnly?: boolean };

const MAIN: Tab[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/escalations", label: "Escalations" },
  { href: "/dashboard/team-chat", label: "Team Chat" },
  { href: "/dashboard/calls", label: "Call Log" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/archived", label: "Archived" },
  { href: "/dashboard/notifications", label: "Notifications" },
];

const ADMIN: Tab[] = [
  { href: "/dashboard/team", label: "Team", adminOnly: true },
  { href: "/dashboard/businesses", label: "Businesses", adminOnly: true },
  { href: "/dashboard/settings", label: "Settings", adminOnly: true },
];

export function DashboardNav({ role, queueBadge, escalationBadge }: { role: Role; queueBadge: number; escalationBadge: number }) {
  const pathname = usePathname();

  const link = (tab: Tab) => {
    // "/dashboard" must match exactly, or it would be active on every nested route.
    const active = tab.href === "/dashboard" ? pathname === tab.href : pathname.startsWith(tab.href);
    const count = tab.href === "/dashboard/inbox" ? queueBadge : tab.href === "/dashboard/escalations" ? escalationBadge : 0;
    const badge = count > 0 ? count : null;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "border-[#B08D57] bg-[#B08D5712] text-[#1C2B47]"
            : "border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        }`}
      >
        {tab.label}
        {badge && (
          <span
            className={`rounded-full px-1.5 text-[11px] font-semibold ${
              tab.href === "/dashboard/escalations" ? "bg-red-600 text-white" : "bg-zinc-200 text-zinc-700"
            }`}
            aria-label={`${badge} need attention`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5 overflow-y-auto p-3">
      {MAIN.map(link)}
      {role === "admin" && (
        <>
          <p className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Admin</p>
          {ADMIN.map(link)}
        </>
      )}
    </nav>
  );
}
