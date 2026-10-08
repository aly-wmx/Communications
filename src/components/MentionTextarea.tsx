"use client";

import { forwardRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { mentionQuery } from "@/lib/comms/mentions";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  team: Array<{ id: string; name: string }>;
  /** Called on Enter (without Shift) when no suggestion list is open. */
  onSubmit?: () => void;
};

/** A textarea that suggests teammates when you type "@". */
export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function MentionTextarea(
  { value, onValueChange, team, onSubmit, className = "", ...rest },
  ref,
) {
  const [query, setQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const matches = query === null ? [] : team.filter((t) => t.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6);

  function update(v: string, pos: number) {
    onValueChange(v);
    setCursor(pos);
    setQuery(mentionQuery(v.slice(0, pos)));
    setHighlight(0);
  }

  function insert(name: string) {
    const before = value.slice(0, cursor).replace(/@[\w]*$/, `@${name} `);
    const next = before + value.slice(cursor);
    onValueChange(next);
    setQuery(null);
    setCursor(before.length);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insert(matches[highlight].name);
        return;
      }
      if (e.key === "Escape") {
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative flex-1">
      <textarea
        ref={ref}
        {...rest}
        value={value}
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onClick={(e) => update(value, e.currentTarget.selectionStart)}
        className={`w-full ${className}`}
      />
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Mention a teammate" className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {matches.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(t.name);
                }}
                className={`w-full px-3 py-1.5 text-left ${i === highlight ? "bg-[#B08D5714] font-semibold" : "hover:bg-zinc-50"}`}
              >
                @{t.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
