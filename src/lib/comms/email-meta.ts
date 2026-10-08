/** Email headers shown on each email bubble, and the people involved across a client's emails. */

export interface EmailMeta {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
}

export interface Address {
  name: string;
  email: string;
}

const EMAIL = /[^\s<>"',;]+@[^\s<>"',;]+\.[^\s<>"',;]+/;

/** "Jane Doe <jane@x.com>", "<jane@x.com>", "jane@x.com" → { name, email }. */
export function parseAddress(raw: string): Address | null {
  const email = EMAIL.exec(raw)?.[0]?.toLowerCase();
  if (!email) return null;
  const name = raw
    .replace(/<[^>]*>/, "")
    .replace(EMAIL, "")
    .replace(/["']/g, "")
    .trim();
  return { name: name && name.toLowerCase() !== email ? name : "", email };
}

/** GHL gives a string, a comma-separated string, or an array (sometimes of objects). */
function list(v: unknown): string[] {
  const items = Array.isArray(v) ? v : typeof v === "string" ? v.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/) : [];
  return items
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as { email?: unknown; address?: unknown }).email ?? (x as { address?: unknown }).address ?? "") : ""))
    .map((x) => x.trim())
    .filter((x) => EMAIL.test(x))
    .slice(0, 50);
}

export function emailMetaFrom(raw: { from?: unknown; to?: unknown; cc?: unknown; bcc?: unknown; subject?: unknown }): EmailMeta {
  return {
    from: list(raw.from)[0] ?? "",
    to: list(raw.to),
    cc: list(raw.cc),
    bcc: list(raw.bcc),
    subject: typeof raw.subject === "string" ? raw.subject.trim().slice(0, 300) : "",
  };
}

/** Everyone on a client's emails (from, to and cc), most frequent first, excluding addresses we'd rather not show (e.g. our own). */
export function participants(metas: Array<EmailMeta | null | undefined>, exclude: (email: string) => boolean = () => false): Array<Address & { count: number }> {
  const seen = new Map<string, Address & { count: number }>();
  for (const m of metas) {
    if (!m) continue;
    for (const raw of [m.from, ...m.to, ...m.cc]) {
      const a = raw ? parseAddress(raw) : null;
      if (!a || exclude(a.email)) continue;
      const prev = seen.get(a.email);
      seen.set(a.email, { email: a.email, name: prev?.name || a.name, count: (prev?.count ?? 0) + 1 });
    }
  }
  return [...seen.values()].sort((x, y) => y.count - x.count || x.email.localeCompare(y.email));
}
