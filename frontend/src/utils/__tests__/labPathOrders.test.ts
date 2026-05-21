import { describe, expect, it } from 'vitest';
import {
  isLabOrderType,
  isOpenLabPathOrder,
  isOpenLabPathStatus,
  isPathOrderType,
} from '../labPathOrders';

describe('lab/path order helpers', () => {
  it('normalizes order type aliases used by Home and Labs/Path', () => {
    expect(isPathOrderType('Pathology')).toBe(true);
    expect(isPathOrderType('dermpath')).toBe(true);
    expect(isPathOrderType('biopsy')).toBe(true);
    expect(isLabOrderType('Lab')).toBe(true);
    expect(isLabOrderType('laboratory')).toBe(true);
  });

  it('treats active lab/path lifecycle statuses as open', () => {
    expect(isOpenLabPathStatus('ordered')).toBe(true);
    expect(isOpenLabPathStatus('sent')).toBe(true);
    expect(isOpenLabPathStatus('in-progress')).toBe(true);
    expect(isOpenLabPathStatus('completed')).toBe(false);
    expect(isOpenLabPathStatus('cancelled')).toBe(false);
  });

  it('matches the Command Center count to visible Labs/Path open orders', () => {
    expect(isOpenLabPathOrder({ type: 'Pathology', status: 'sent' })).toBe(true);
    expect(isOpenLabPathOrder({ type: 'Lab', status: 'ordered' })).toBe(true);
    expect(isOpenLabPathOrder({ type: 'biopsy', status: 'pending' })).toBe(true);
    expect(isOpenLabPathOrder({ type: 'imaging', status: 'pending' })).toBe(false);
    expect(isOpenLabPathOrder({ type: 'lab', status: 'completed' })).toBe(false);
  });
});
