"use client";

import { useState, useTransition } from "react";
import { ROLES, ROLE_LABELS } from "@/lib/roles";
import { DEPARTMENTS } from "@/lib/stages";
import { addFromGhl, linkGhlUser, setBusinessAccess, syncLinkedFromGhl } from "./actions";
import { useConfirm } from "@/components/ui/confirm";

interface GhlUser {
  id: string;
  name: string;
  email: string;
  phone: string;
}
interface Member {
  id: string;
  name: string;
  ghl_user_id: string | null;
  role: string;
}
interface Group {
  businessId: string;
  name: string;
  /** GHL users in this business's sub-account. */
  userIds: string[];
}

/** GoHighLevel users, grouped by the business whose sub-account they're in: add, link or unlink, grant access, copy details. */
export function GhlUsers({
  users,
  members,
  groups,
  granted,
  refreshedAt,
  error,
}: {
  users: GhlUser[];
  members: Member[];
  groups: Group[];
  /** "memberId|businessId" */
  granted: string[];
  refreshedAt: string;
  error: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [choice, setChoice] = useState<Record<string, { role: string; department: string }>>({});

  const linkedTo = (uid: string) => members.find((m) => m.ghl_user_id === uid);
  const unlinkedMembers = members.filter((m) => !m.ghl_user_id);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; updated?: number }>, okText: string) =>
    startTransition(async () => {
      const r = await fn();
      setMessage(r.ok ? { text: r.updated !== undefined ? `${okText} (${r.updated} updated)` : okText, ok: true } : { text: r.error ?? "Something went wrong.", ok: false });
    });

  const sorted = [...users].sort((a, b) => Number(Boolean(linkedTo(b.id))) - Number(Boolean(linkedTo(a.id))) || a.name.localeCompare(b.name));
  const has = new Set(granted);
  const placed = new Set(groups.flatMap((g) => g.userIds));
  const sections = [
    ...groups.filter((g) => g.userIds.length).map((g) => ({ ...g, users: sorted.filter((u) => g.userIds.includes(u.id)) })),
    ...(sorted.some((u) => !placed.has(u.id))
      ? [{ businessId: "", name: "Not in a connected sub-account", userIds: [], users: sorted.filter((u) => !placed.has(u.id)) }]
      : []),
  ];

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">GoHighLevel users</h2>
          <p className="text-xs text-zinc-500">
            Your GHL users, refreshed hourly{refreshedAt ? ` (last ${refreshedAt})` : ""}. Linking someone credits their GHL replies to them.
            Adding someone lets them sign in, with access to the businesses whose sub-account they&apos;re in.
          </p>
          {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => syncLinkedFromGhl(), "Copied names and phone numbers from GoHighLevel")}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
        >
          ⟳ Copy names &amp; phones from GHL
        </button>
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-success" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      {sections.map((section) => (
      <div key={section.businessId || "none"} className="overflow-x-auto">
        <h3 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {section.name} <span className="font-normal normal-case tracking-normal text-zinc-500">· {section.users.length} in GoHighLevel</span>
        </h3>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="py-1.5">GHL user</th>
              <th className="py-1.5">Email</th>
              <th className="py-1.5">Phone</th>
              <th className="py-1.5">In the portal</th>
            </tr>
          </thead>
          <tbody>
            {section.users.map((u) => {
              const member = linkedTo(u.id);
              const noAccess = Boolean(member && section.businessId && member.role !== "admin" && !has.has(`${member.id}|${section.businessId}`));
              const c = choice[u.id] ?? { role: "coordinator", department: "" };
              return (
                <tr key={u.id} className="border-t border-zinc-100 align-middle">
                  <td className="py-2 pr-2 font-medium text-zinc-800">{u.name}</td>
                  <td className="py-2 pr-2 text-zinc-600">{u.email || "—"}</td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-600">{u.phone || "—"}</td>
                  <td className="py-2">
                    {member ? (
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">✓ {member.name}</span>
                        {noAccess && (
                          <>
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Can&apos;t open {section.name}</span>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(() => setBusinessAccess({ memberId: member!.id, businessId: section.businessId, grant: true }), `${member!.name} can now open ${section.name}`)
                              }
                              className="rounded-md bg-navy px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              Grant
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => linkGhlUser({ memberId: member.id, ghlUserId: "" }), `Unlinked ${member.name}`)}
                          className="text-xs text-zinc-500 hover:text-red-600"
                        >
                          Unlink
                        </button>
                      </span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`Role for ${u.name}`}
                          value={c.role}
                          onChange={(e) => setChoice({ ...choice, [u.id]: { ...c, role: e.target.value } })}
                          className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Department for ${u.name}`}
                          value={c.department}
                          onChange={(e) => setChoice({ ...choice, [u.id]: { ...c, department: e.target.value } })}
                          className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs"
                        >
                          <option value="">All departments</option>
                          {Object.entries(DEPARTMENTS).map(([k, d]) => (
                            <option key={k} value={k}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={pending || !u.email}
                          title={u.email ? undefined : "No email in GHL"}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Add ${u.name} to the portal?`,
                              body: `${u.email} will be able to sign in as ${ROLE_LABELS[c.role as keyof typeof ROLE_LABELS]}${
                                c.role === "admin"
                                  ? ", with access to every business."
                                  : ` and open ${groups.filter((g) => g.userIds.includes(u.id)).map((g) => g.name).join(", ") || "no businesses yet (tick them under Business access)"}.`
                              }`,
                              confirmLabel: "Add",
                            });
                            if (ok) run(() => addFromGhl({ ghlUserId: u.id, role: c.role, department: c.department }), `Added ${u.name}`);
                          }}
                          className="rounded-md bg-navy px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Add
                        </button>
                        {unlinkedMembers.length > 0 && (
                          <select
                            aria-label={`Link ${u.name} to an existing teammate`}
                            value=""
                            disabled={pending}
                            onChange={(e) => e.target.value && run(() => linkGhlUser({ memberId: e.target.value, ghlUserId: u.id }), `Linked ${u.name}`)}
                            className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-500"
                          >
                            <option value="">or link to…</option>
                            {unlinkedMembers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ))}
    </section>
  );
}
