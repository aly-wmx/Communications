/** Find @mentions of teammates in a note: "@Reid", "@reid", or a full name like "@Chris Lee". */
export function findMentions(body: string, team: Array<{ id: string; name: string }>): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  // Longest names first, so "@Chris Lee" isn't also counted as a "@Chris" mention of someone else.
  for (const t of [...team].sort((a, b) => b.name.length - a.name.length)) {
    const full = t.name.trim().toLowerCase();
    const first = full.split(/\s+/)[0];
    for (const n of new Set([full, first])) {
      if (!n) continue;
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^\\w@])@${escaped}(?![\\w])`, "i").test(text)) found.add(t.id);
    }
  }
  return [...found];
}

/** The "@word" being typed at the cursor, for the suggestions list ("" when not typing a mention). */
export function mentionQuery(textBeforeCursor: string): string | null {
  const m = /(^|\s)@([\w]*)$/.exec(textBeforeCursor);
  return m ? m[2] : null;
}
