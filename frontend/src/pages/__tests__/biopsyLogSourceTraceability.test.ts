import { describe, expect, it } from 'vitest';
import { biopsyMatchesSearch } from '../../utils/mipsSourceTraceability';

describe('biopsy source traceability search', () => {
  it('matches the opaque biopsy record ID without requiring patient identity', () => {
    expect(biopsyMatchesSearch({ id: 'biopsy-source-42' }, 'biopsy-source-42')).toBe(true);
    expect(biopsyMatchesSearch({ id: 'biopsy-source-42' }, 'BIopsy-Source-42')).toBe(true);
    expect(biopsyMatchesSearch({ id: 'biopsy-source-42' }, 'other-source')).toBe(false);
  });
});
