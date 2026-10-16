"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { grantSuggestedAccess, setBusinessAccess } from "./actions";

interface Member {
  id: string;
  name: string;
  role: Role;
}

/**
 * Which businesses each teammate can open. Admins see every business. "In GHL"
 * marks a business whose GoHighLevel sub-account lists this person but who
 * can't open it here yet: a suggestion an admin can grant.
 */
export function AccessMatrix({
  businesses,
  members,
  granted,
  suggested,
}: {
  businesses: Array<{ id: string; name: string }>;
  members: Member[];
  /** "memberId|businessId" */
  granted: string[];
  suggested: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [has, setHas] = useState(() => new Set(granted));
  const hint = new Set(suggested);

  function toggle(member: Member, businessId: string, name: string) {
    const key = `${member.id}|${businessId}`;
    const grant = !has.has(key);
    setHas((s) => {
      const next = new Set(s);
      if (grant) next.add(key);
      else next.delete(key);
      return next;
    });
    startTransition(async () => {
      const result = await setBusinessAccess({ memberId: member.id, businessId, grant });
      if (!result.ok) {
        setHas((s) => {
          const next = new Set(s);
          if (grant) next.delete(key);
          else next.add(key);
          return next;
        });
        return toast(result.error, "error");
      }
      toast(grant ? `${member.name} can now open ${name}` : `${member.name} can no longer open ${name}`);
    });
  }

  function grantAll() {
    startTransition(async () => {
      const result = await grantSuggestedAccess();
      if (!result.ok) return toast(result.error, "error");
      toast(result.updated ? `Granted ${result.updated} suggested access${result.updated === 1 ? "" : "es"}` : "Nothing to grant");
      router.refresh();
    });
  }

  const openSuggestions = suggested.filter((k) => !has.has(k)).length;

  return (
    <Card
      title="Business access"
      action={
        openSuggestions > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={grantAll}
            className="min-h-9 rounded-md bg-navy px-3 text-xs font-semibold text-white hover:bg-navy-hover disabled:opacity-50"
          >
            Grant all suggested ({openSuggestions})
          </button>
        )
      }
    >
      <p className="px-4 pt-3 text-xs text-zinc-600">
        Each teammate only sees the clients, conversations, calls and tickets of the businesses ticked here, and only gets alerts for
        those. Admins see every business. <StatusPill tone="warning">In GHL</StatusPill> means they&apos;re a user in that business&apos;s
        GoHighLevel sub-account but can&apos;t open it here yet.
      </p>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-zinc-600">
              <th className="py-1.5 pr-3">Teammate</th>
              {businesses.map((b) => (
                <th key={b.id} className="px-2 py-1.5 text-center">
                  {b.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-zinc-100">
                <td className="py-2 pr-3">
                  <span className="font-medium text-zinc-900">{m.name}</span>
                  <span className="ml-1.5 text-xs text-zinc-500">{ROLE_LABELS[m.role]}</span>
                </td>
                {businesses.map((b) => {
                  const key = `${m.id}|${b.id}`;
                  if (m.role === "admin") {
                    return (
                      <td key={b.id} className="px-2 py-2 text-center text-xs text-zinc-500">
                        All
                      </td>
                    );
                  }
                  const on = has.has(key);
                  return (
                    <td key={b.id} className="px-2 py-2 text-center">
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending}
                          onChange={() => toggle(m, b.id, b.name)}
                          aria-label={`${m.name} can open ${b.name}`}
                          className="size-4 accent-navy"
                        />
                        {!on && hint.has(key) && <StatusPill tone="warning">In GHL</StatusPill>}
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
