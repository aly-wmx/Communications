import { channelStyle } from "@/lib/comms/channels";

/** Coloured channel label, the same colour everywhere in the portal. */
export function ChannelTag({ channel, className = "" }: { channel: string; className?: string }) {
  const s = channelStyle(channel);
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${s.tag} ${className}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
