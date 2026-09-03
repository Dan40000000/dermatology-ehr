import { describe, expect, it } from 'vitest';
import { filterChronicTherapyBySourceId } from '../RegistryPage';

describe('chronic therapy source traceability search', () => {
  it('selects only the exact opaque source ID', () => {
    const rows = [
      { id: 'therapy-source-42' },
      { id: 'therapy-source-420' },
    ];

    expect(filterChronicTherapyBySourceId(rows, 'therapy-source-42')).toEqual([{ id: 'therapy-source-42' }]);
    expect(filterChronicTherapyBySourceId(rows, '')).toEqual(rows);
  });
});
