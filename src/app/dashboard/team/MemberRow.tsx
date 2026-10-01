"use client";

import { useState, useTransition } from "react";
import { EditableSelectCell, EditableTextCell } from "@/components/EditableCell";
import { ROLES, ROLE_LABELS } from "@/lib/roles";
import type { Database } from "@/lib/supabase/database.types";
import { deleteMember, inviteMember, updateMemberField } from "./actions";

type Member = Database["public"]["Tables"]["team_members"]["Row"];

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export function MemberRow({
  member,
  isMe,
  onMessage,
}: {
  member: Member;
  isMe: boolean;
  onMessage: (message: string, tone: "error" | "info") => void;
}) {
  const [pending, startTransition] = useTransition();
  const [escalation, setEscalation] = useState(member.escalation);

  function handleEscalation(next: boolean) {
    setEscalation(next);
    startTransition(async () => {
      const result = await updateMemberField({ id: member.id, field: "escalation", value: next });
      if (!result.ok) {
        setEscalation(!next);
        onMessage(result.error, "error");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Remove ${member.name}? They lose access, and their open contacts become unassigned.`)) return;
    startTransition(async () => {
      const result = await deleteMember({ id: member.id });
      if (!result.ok) onMessage(result.error, "error");
    });
  }

  function handleInvite() {
    startTransition(async () => {
      const result = await inviteMember({ id: member.id });
      onMessage(result.ok ? `Invite sent to ${member.email}.` : result.error, result.ok ? "info" : "error");
    });
  }

  return (
    <tr className="border-b border-zinc-100 align-top last:border-0">
      <td className="px-1.5 py-1">
        <EditableTextCell value={member.name} onSave={(value) => updateMemberField({ id: member.id, field: "name", value })} />
        {isMe && <p className="px-2 text-[11px] text-zinc-400">You</p>}
      </td>
      <td className="px-1.5 py-1">
        {isMe ? (
          <p className="px-2 py-1 text-sm text-zinc-700">{member.email}</p>
        ) : (
          <EditableTextCell
            value={member.email}
            placeholder="name@company.com"
            onSave={(value) => updateMemberField({ id: member.id, field: "email", value })}
          />
        )}
        {!member.email && <p className="px-2 text-[11px] text-amber-700">No email — can&apos;t sign in</p>}
      </td>
      <td className="px-1.5 py-1">
        {isMe ? (
          <p className="px-2 py-1 text-sm text-zinc-700">{ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role}</p>
        ) : (
          <EditableSelectCell
            value={member.role}
            options={ROLE_OPTIONS}
            onSave={(value) => updateMemberField({ id: member.id, field: "role", value })}
          />
        )}
      </td>
      <td className="px-1.5 py-1">
        <EditableTextCell value={member.phone} onSave={(value) => updateMemberField({ id: member.id, field: "phone", value })} />
      </td>
      <td className="px-1.5 py-1">
        <EditableTextCell
          value={member.slack_user_id}
          placeholder="U01ABC2DEF"
          onSave={(value) => updateMemberField({ id: member.id, field: "slack_user_id", value })}
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={escalation}
          disabled={pending}
          onChange={(e) => handleEscalation(e.target.checked)}
          aria-label={`${member.name} receives escalations`}
          className="size-4 accent-[#B08D57]"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right">
        {member.email && !isMe && (
          <button
            type="button"
            disabled={pending}
            onClick={handleInvite}
            className="mr-3 text-xs font-semibold text-[#B08D57] hover:underline disabled:opacity-50"
          >
            Send invite
          </button>
        )}
        {!isMe && (
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
            aria-label={`Remove ${member.name}`}
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}
