import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BodyMapLesions from '../BodyMapLesions';

const makeLesion = (id: string) => ({
  id,
  patientId: 'patient-1',
  bodyLocationCode: 'HEAD',
  bodyLocationDescription: `Head lesion ${id}`,
  firstDocumented: '2025-01-01',
  status: 'active' as const,
  clinicalDescription: null,
  suspicionLevel: 2,
});

describe('BodyMapLesions region marker accessibility', () => {
  it('does not expose a multi-lesion region marker as an inert button', () => {
    const onSelectLesion = vi.fn();
    render(
      <BodyMapLesions
        lesions={[makeLesion('one'), makeLesion('two')]}
        alerts={[]}
        onSelectLesion={onSelectLesion}
      />,
    );

    const marker = screen.getByRole('img', { name: 'HEAD: 2 lesions' });
    expect(marker).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HEAD: 2 lesions' })).not.toBeInTheDocument();

    fireEvent.click(marker);
    expect(onSelectLesion).not.toHaveBeenCalled();
  });

  it('keeps a single-lesion region marker actionable', () => {
    const onSelectLesion = vi.fn();
    render(
      <BodyMapLesions
        lesions={[makeLesion('one')]}
        alerts={[]}
        onSelectLesion={onSelectLesion}
      />,
    );

    const marker = screen.getByRole('button', { name: 'HEAD: 1 lesion' });
    fireEvent.click(marker);
    expect(onSelectLesion).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }));
  });
});
