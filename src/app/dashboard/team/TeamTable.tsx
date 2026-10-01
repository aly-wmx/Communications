"use client";

import { useState, useTransition } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { addMember } from "./actions";
import { MemberRow } from "./MemberRow";

type Member = Database["public"]["Tables"]["team_members"]["Row"];

export function TeamTable({ members, meId }: { members: Member[]; meId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" } | null>(null);

  function handleAdd() {
    setMessage(null);
    startTransition(async () => {
      const result = await addMember();
      if (!result.ok) setMessage({ text: result.error, tone: "error" });
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email (sign-in)</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Phone</th>
            <th className="px-3 py-2">Slack member ID</th>
            <th className="px-3 py-2 text-center">Escalations</th>
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
            />
          ))}
        </tbody>
      </table>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`border-t border-zinc-200 px-3 py-2 text-xs ${message.tone === "error" ? "text-red-600" : "text-[#3F7A5C]"}`}
        >
          {message.text}
        </p>
      )}
      <div className="border-t border-zinc-200 px-3 py-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleAdd}
          className="text-xs font-semibold text-[#B08D57] hover:underline disabled:opacity-50"
        >
          + Add person
        </button>
      </div>
    </div>
  );
}
