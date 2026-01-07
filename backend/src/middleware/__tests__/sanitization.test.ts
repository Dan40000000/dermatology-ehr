import { sanitizeInputs } from '../sanitization';

describe('sanitizeInputs', () => {
  it('passes through to next middleware', () => {
    const req = {} as any;
    const res = {} as any;
    const next = jest.fn();

    sanitizeInputs(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
