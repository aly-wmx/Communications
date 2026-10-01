import { formatMinutes, slaState } from '../../lib/tracker/sla';
import type { ClientContact, SlaSettings } from '../../lib/tracker/types';

const LABEL = {
  ok: 'On time',
  reminder: 'Due soon',
  breach: 'Overdue',
  responded: 'Responded',
  paused: 'Paused',
} as const;

const TONE = {
  ok: 'good',
  reminder: 'warn',
  breach: 'bad',
  responded: 'neutral',
  paused: 'neutral',
} as const;

/** SLA state with a text label and icon so it never relies on colour alone. */
export function SlaPill({ contact, sla, now }: { contact: ClientContact; sla: SlaSettings; now: Date }) {
  const st = slaState(contact, sla, now);
  const icon = st.stage === 'breach' ? '!' : st.stage === 'reminder' ? '◔' : st.stage === 'ok' ? '●' : '✓';
  const detail =
    st.stage === 'responded'
      ? `in ${formatMinutes(st.waitedMinutes)}`
      : st.stage === 'paused'
        ? ''
        : formatMinutes(st.waitedMinutes);
  const title =
    st.minutesToNext != null
      ? `${formatMinutes(st.minutesToNext)} until ${st.stage === 'ok' ? 'reminder' : 'escalation'}`
      : undefined;
  return (
    <span className={`sla sla-${TONE[st.stage]}`} title={title}>
      <span aria-hidden className="sla-icon">
        {icon}
      </span>
      <span className="sla-label">{LABEL[st.stage]}</span>
      {detail && <span className="sla-time">{detail}</span>}
    </span>
  );
}
