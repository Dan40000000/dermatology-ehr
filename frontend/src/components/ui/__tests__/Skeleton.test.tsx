import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonList, TableSkeleton, CardSkeleton } from '../Skeleton';

describe('Skeleton Component', () => {
  it('renders single skeleton', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton')).toBeInTheDocument();
  });

  it('renders with shimmer animation by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton-shimmer')).toBeInTheDocument();
  });

  it('renders without animation when animate is false', () => {
    const { container } = render(<Skeleton animate={false} />);
    expect(container.querySelector('.skeleton-shimmer')).not.toBeInTheDocument();
  });

  it('renders text variant', () => {
    const { container } = render(<Skeleton variant="text" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.height).toBe('1em');
  });

  it('renders avatar variant', () => {
    const { container } = render(<Skeleton variant="avatar" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.width).toBe('40px');
    expect(skeleton.style.height).toBe('40px');
    expect(skeleton.style.borderRadius).toBe('50%');
  });

  it('renders circular variant', () => {
    const { container } = render(<Skeleton variant="circular" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.borderRadius).toBe('50%');
  });

  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.height).toBe('120px');
  });

  it('renders row variant', () => {
    const { container } = render(<Skeleton variant="row" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.height).toBe('60px');
  });

  it('renders rectangular variant', () => {
    const { container } = render(<Skeleton variant="rectangular" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.height).toBe('100%');
  });

  it('applies custom width', () => {
    const { container } = render(<Skeleton width="200px" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.width).toBe('200px');
  });

  it('applies custom width as number', () => {
    const { container } = render(<Skeleton width={150} />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.width).toBe('150px');
  });

  it('applies custom height', () => {
    const { container } = render(<Skeleton height="100px" />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.height).toBe('100px');
  });

  it('applies custom height as number', () => {
    const { container } = render(<Skeleton height={80} />);
    const skeleton = container.querySelector('.skeleton') as HTMLElement;
    expect(skeleton.style.height).toBe('80px');
  });

  it('renders multiple skeletons with count', () => {
    const { container } = render(<Skeleton count={3} />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons).toHaveLength(3);
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-skeleton" />);
    expect(container.querySelector('.custom-skeleton')).toBeInTheDocument();
  });
});

describe('SkeletonList Component', () => {
  it('renders default number of rows', () => {
    const { container } = render(<SkeletonList />);
    const rows = container.querySelectorAll('.list-row');
    expect(rows).toHaveLength(3);
  });

  it('renders custom number of rows', () => {
    const { container } = render(<SkeletonList count={5} />);
    const rows = container.querySelectorAll('.list-row');
    expect(rows).toHaveLength(5);
  });

  it('renders rows with skeleton class', () => {
    const { container } = render(<SkeletonList />);
    const rows = container.querySelectorAll('.list-row.skeleton');
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('TableSkeleton Component', () => {
  it('renders default table structure', () => {
    const { container } = render(<TableSkeleton />);
    const rows = container.querySelectorAll('.skeleton-table-row');
    expect(rows).toHaveLength(5);
  });

  it('renders custom number of rows', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const rows = container.querySelectorAll('.skeleton-table-row');
    expect(rows).toHaveLength(3);
  });

  it('renders custom number of columns', () => {
    const { container } = render(<TableSkeleton columns={6} />);
    const firstRow = container.querySelector('.skeleton-table-row');
    const cells = firstRow?.querySelectorAll('.skeleton');
    expect(cells).toHaveLength(6);
  });

  it('renders correct grid structure', () => {
    const { container } = render(<TableSkeleton rows={2} columns={3} />);
    const rows = container.querySelectorAll('.skeleton-table-row');
    expect(rows).toHaveLength(2);

    rows.forEach((row) => {
      const cells = row.querySelectorAll('.skeleton');
      expect(cells).toHaveLength(3);
    });
  });
});

describe('CardSkeleton Component', () => {
  it('renders card skeleton structure', () => {
    const { container } = render(<CardSkeleton />);
    expect(container.querySelector('.skeleton-card')).toBeInTheDocument();
  });

  it('renders multiple skeleton elements', () => {
    const { container } = render(<CardSkeleton />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(1);
  });

  it('renders rectangular skeleton for image', () => {
    const { container } = render(<CardSkeleton />);
    const skeletons = container.querySelectorAll('.skeleton');
    const firstSkeleton = skeletons[0] as HTMLElement;
    expect(firstSkeleton.style.height).toBe('120px');
  });
});
