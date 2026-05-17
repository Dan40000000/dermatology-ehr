import { beforeEach, describe, expect, it } from 'vitest';
import {
  queryDemoFinancialWorkQueue,
  resolveDemoFinancialWorkQueueItem,
} from '../demoRevenueCycle';

describe('demo revenue cycle work queue', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('removes resolved financial work queue items from the open demo queue', () => {
    const before = queryDemoFinancialWorkQueue(new URLSearchParams('status=open')).items;
    expect(before.length).toBeGreaterThan(0);

    const target = before[0];
    const result = resolveDemoFinancialWorkQueueItem(target.id, 'Resolved during QA');

    expect(result).toMatchObject({
      success: true,
      item: {
        id: target.id,
        status: 'resolved',
        resolutionNote: 'Resolved during QA',
      },
    });

    const after = queryDemoFinancialWorkQueue(new URLSearchParams('status=open')).items;
    expect(after.some((item) => item.id === target.id)).toBe(false);
  });

  it('returns stable IDs for claim and bill queue items', () => {
    const firstRead = queryDemoFinancialWorkQueue(new URLSearchParams('status=open')).items.map((item) => item.id);
    const secondRead = queryDemoFinancialWorkQueue(new URLSearchParams('status=open')).items.map((item) => item.id);

    expect(secondRead).toEqual(firstRead);
    expect(firstRead.every((id) => id.startsWith('demo-fwq-claim-demo-claim-') || id.startsWith('demo-fwq-bill-demo-bill-'))).toBe(true);
  });
});
