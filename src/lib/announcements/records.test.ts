import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  computeStats,
  createRecord,
  emptyFilters,
  isOverdue,
  parseBackup,
  updateRecord,
} from './records';
import { emptyInput, type CommunicationInput } from './types';

const input = (over: Partial<CommunicationInput> = {}): CommunicationInput => ({
  ...emptyInput(),
  title: 'Newsletter',
  ...over,
});

describe('createRecord / updateRecord', () => {
  it('records creation in history and trims tags', () => {
    const r = createRecord(input({ tags: [' a ', 'a', '', 'b'] }));
    expect(r.history).toHaveLength(1);
    expect(r.tags).toEqual(['a', 'b']);
  });

  it('stamps sentDate when marked Sent without one', () => {
    const r = createRecord(input({ status: 'Sent' }));
    expect(r.sentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('logs tracked field changes only', () => {
    const r = createRecord(input());
    const same = updateRecord(r, { ...input(), notes: 'changed' });
    expect(same.history).toHaveLength(1);
    const moved = updateRecord(r, input({ status: 'In review', owner: 'Sam' }));
    expect(moved.history).toHaveLength(2);
    expect(moved.history[1].message).toContain('Status: Draft → In review');
    expect(moved.history[1].message).toContain('Owner: — → Sam');
  });
});

describe('isOverdue', () => {
  it('flags past scheduled items that are not sent or cancelled', () => {
    const on = '2026-10-10';
    expect(isOverdue(createRecord(input({ scheduledDate: '2026-10-09' })), on)).toBe(true);
    expect(isOverdue(createRecord(input({ scheduledDate: '2026-10-10' })), on)).toBe(false);
    expect(
      isOverdue(createRecord(input({ scheduledDate: '2026-10-01', status: 'Cancelled' })), on),
    ).toBe(false);
    expect(
      isOverdue(createRecord(input({ scheduledDate: '2026-10-01', status: 'Sent' })), on),
    ).toBe(false);
  });
});

describe('applyFilters', () => {
  const list = [
    createRecord(input({ title: 'Press release', channel: 'Press release', scheduledDate: '2026-10-05' })),
    createRecord(input({ title: 'Staff email', audience: 'All staff', scheduledDate: '2026-11-01' })),
  ];

  it('searches across text fields', () => {
    expect(applyFilters(list, { ...emptyFilters, search: 'staff' })).toHaveLength(1);
  });

  it('filters by channel and date range', () => {
    expect(applyFilters(list, { ...emptyFilters, channel: 'Press release' })).toHaveLength(1);
    expect(applyFilters(list, { ...emptyFilters, from: '2026-10-15' })[0].title).toBe('Staff email');
  });
});

describe('computeStats', () => {
  it('counts the headline numbers', () => {
    const on = '2026-10-10';
    const s = computeStats(
      [
        createRecord(input({ status: 'Sent', sentDate: '2026-10-02', reach: 100 })),
        createRecord(input({ status: 'Sent', sentDate: '2026-09-20' })),
        createRecord(input({ status: 'In review', scheduledDate: '2026-10-12' })),
        createRecord(input({ status: 'Draft', scheduledDate: '2026-10-01' })),
      ],
      on,
    );
    expect(s.sentThisMonth).toBe(1);
    expect(s.reachThisMonth).toBe(100);
    expect(s.awaitingApproval).toBe(1);
    expect(s.upcoming7).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.monthly.map((m) => m.count)).toEqual([0, 0, 0, 0, 1, 1]);
  });
});

describe('backup', () => {
  it('round-trips a backup and coerces unknown values', () => {
    const r = createRecord(input());
    const back = parseBackup(JSON.stringify({ communications: [r, { title: 'X', channel: 'Fax' }] }));
    expect(back[0]).toEqual(r);
    expect(back[1].channel).toBe('Other');
    expect(() => parseBackup('{"foo":1}')).toThrow();
  });
});
