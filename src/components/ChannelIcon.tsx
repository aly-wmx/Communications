import { Mail, MessageCircle, MessagesSquare, Phone, PhoneMissed, Voicemail, type LucideProps } from "lucide-react";

const ICONS = {
  Text: MessageCircle,
  Email: Mail,
  "Portal message": MessagesSquare,
  Call: Phone,
  "Missed call": PhoneMissed,
  Voicemail: Voicemail,
} as const;

/** The channel's icon (decorative: the channel name is always shown beside it). */
export function ChannelIcon({ channel, className = "size-3.5", ...rest }: { channel: string } & LucideProps) {
  const Icon = ICONS[channel as keyof typeof ICONS] ?? MessageCircle;
  return <Icon aria-hidden className={className} {...rest} />;
}
