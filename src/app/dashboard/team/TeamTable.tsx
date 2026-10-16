"use client";

import { useState, useTransition } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { addMember, grantSuggestedAccess } from "./actions";
import { MemberRow } from "./MemberRow";

type Member = Database["public"]["Tables"]["team_members"]["Row"];

export function TeamTable({
  members,
  meId,
  businesses,
  granted,
  suggested,
}: {
  members: Member[];
  meId: string;
  businesses: Array<{ id: string; name: string }>;
  /** "memberId|businessId" */
  granted: string[];
  suggested: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" } | null>(null);
  const idsFor = (list: string[], memberId: string) => list.filter((k) => k.startsWith(`${memberId}|`)).map((k) => k.split("|")[1]);
  const waiting = suggested.filter((k) => !granted.includes(k)).length;

  function grantAll() {
    startTransition(async () => {
      const result = await grantSuggestedAccess();
      if (!result.ok) return toast(result.error, "error");
      toast(result.updated ? `Granted ${result.updated} suggested business access${result.updated === 1 ? "" : "es"}` : "Nothing to grant");
      router.refresh();
    });
  }

  function handleAdd() {
    setMessage(null);
    startTransition(async () => {
      const result = await addMember();
      if (!result.ok) setMessage({ text: result.error, tone: "error" });
    });
  }

  return (
    <div className="space-y-2">
      {waiting > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            {waiting} business access{waiting === 1 ? "" : "es"} suggested by GoHighLevel: teammates who are in a business&apos;s sub-account but
            can&apos;t open it here yet (marked “in GHL” below).
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={grantAll}
            className="min-h-9 rounded-md bg-navy px-3 text-xs font-semibold text-white hover:bg-navy-hover disabled:opacity-50"
          >
            Grant all suggested
          </button>
        </div>
      )}
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-full min-w-[1260px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email (sign-in)</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2" title="The GoHighLevel sub-accounts (businesses) they can open">
              Businesses
            </th>
            <th className="px-3 py-2">Department</th>
            <th className="px-3 py-2">Phone</th>
            <th className="px-3 py-2">Slack member ID</th>
            <th className="px-3 py-2 text-center">Escalations</th>
            <th className="px-3 py-2 text-center" title="Can send texts and emails to clients from the portal">
              Can send
            </th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isMe={member.id === meId}
              onMessage={(text, tone) => setMessage({ text, tone })}
              businesses={businesses}
              granted={idsFor(granted, member.id)}
              suggested={idsFor(suggested, member.id)}
            />
          ))}
        </tbody>
      </table>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`border-t border-zinc-200 px-3 py-2 text-xs ${message.tone === "error" ? "text-red-600" : "text-success"}`}
        >
          {message.text}
        </p>
      )}
      <div className="border-t border-zinc-200 px-3 py-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleAdd}
          className="text-xs font-semibold text-gold-ink hover:underline disabled:opacity-50"
        >
          + Add person
        </button>
      </div>
    </div>
    </div>
  );
}
