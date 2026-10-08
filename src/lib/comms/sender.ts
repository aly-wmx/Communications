/** "Who sent this, and from where" — the small label under each chat bubble. */

export interface SenderInput {
  direction: string;
  source: string;
  sentByUser: boolean;
  ghlUserId: string;
}

export function senderLabel(m: SenderInput, ghlUserName: (id: string) => string | undefined): string {
  const source = m.source.toLowerCase();
  if (m.direction !== "outbound") {
    if (source.startsWith("portal:")) return `Logged by ${m.source.slice(7)}`;
    return "via GoHighLevel";
  }
  if (source.startsWith("portal:")) return `${m.source.slice(7)} · via Portal`;
  if (m.sentByUser || m.ghlUserId) {
    const name = m.ghlUserId ? ghlUserName(m.ghlUserId) : undefined;
    return `${name ?? "Team member"} · via GoHighLevel${source.includes("mobile") ? " app" : ""}`;
  }
  if (source.includes("campaign") || source.includes("bulk")) return "Automated · GHL campaign";
  if (source.includes("workflow") || source.includes("automation")) return "Automated · GHL workflow";
  return "Automated · GoHighLevel";
}
