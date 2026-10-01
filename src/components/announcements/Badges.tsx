import type { Priority, Status } from '../../lib/types';

const statusClass: Record<Status, string> = {
  Draft: 'neutral',
  'In review': 'warn',
  Approved: 'info',
  Scheduled: 'accent',
  Sent: 'good',
  Cancelled: 'muted',
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${statusClass[status]}`}>{status}</span>;
}

export function PriorityTag({ priority }: { priority: Priority }) {
  if (priority === 'Normal' || priority === 'Low') return null;
  return <span className={`badge badge-${priority === 'Urgent' ? 'bad' : 'warn'}`}>{priority}</span>;
}

export function OverdueTag() {
  return <span className="badge badge-bad">Overdue</span>;
}
