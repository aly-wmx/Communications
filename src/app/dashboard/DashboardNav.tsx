"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES, type PageAccess, type Role } from "@/lib/roles";

type Tab = Pick<PageAccess, "href" | "label">;

// From the shared access list, so the menu matches what "My access" tells people.
const MAIN: Tab[] = PAGES.filter((p) => p.roles.length > 1);
const ADMIN: Tab[] = PAGES.filter((p) => p.roles.length === 1 && p.roles[0] === "admin");

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
