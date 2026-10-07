/** Formatting rules for messages sent from the portal. */

/** "+1 (555) 014-2000" / "5550142000" → "+15550142000". Returns "" when it can't be a phone number. */
export function toE164(phone: string, defaultCountry = "1"): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountry)) return `+${digits}`;
  return "";
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Plain text typed in the composer → safe email HTML, keeping paragraphs and line breaks. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** How many SMS segments a message uses (160 per single segment, 153 when split; 70/67 with emoji or accents). */
export function smsSegments(text: string): number {
  if (!text) return 0;
  const gsm = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€^{}\\[~\]|]*$/.test(text);
  const len = [...text].length;
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return len <= single ? 1 : Math.ceil(len / multi);
}

/** Email HTML → readable plain text for the chat: keeps line breaks, drops styling and quoted-reply chains. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Cut the quoted earlier conversation ("On Mon, … wrote:") — it's already in the thread.
  const quoted = text.search(/\n\s*On .{5,120}wrote:\s*\n/);
  return (quoted > 0 ? text.slice(0, quoted) : text).trim();
}
