import { SMS_TEMPLATES } from '../smsWorkflowService';
import { assertSmsContentSafe, normalizeSmsTemplateForMinimumNecessary } from '../../utils/smsPrivacyGuard';

describe('smsWorkflowService templates', () => {
  it('keeps all default outbound SMS templates minimum necessary', () => {
    const unsafeTemplates: string[] = [];

    for (const [name, template] of Object.entries(SMS_TEMPLATES)) {
      const normalized = normalizeSmsTemplateForMinimumNecessary(template);
      try {
        assertSmsContentSafe(normalized);
      } catch {
        unsafeTemplates.push(name);
      }
    }

    expect(unsafeTemplates).toEqual([]);
  });
});
