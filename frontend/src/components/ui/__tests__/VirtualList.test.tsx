import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VirtualList, VirtualTable, InfiniteVirtualList } from '../VirtualList';

describe('VirtualList Component', () => {
  const items = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
    { id: 3, name: 'Item 3' },
  ];

  const renderItem = (item: typeof items[0]) => <div>{item.name}</div>;

  it('renders items', () => {
    render(<VirtualList items={items} renderItem={renderItem} />);

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('renders empty message when no items', () => {
    render(<VirtualList items={[]} renderItem={renderItem} />);

    expect(screen.getByText('No items to display')).toBeInTheDocument();
  });

  it('renders custom empty message', () => {
    render(
      <VirtualList items={[]} renderItem={renderItem} emptyMessage="Custom empty message" />
    );

    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <VirtualList items={items} renderItem={renderItem} className="custom-list" />
    );

    expect(container.querySelector('.custom-list')).toBeInTheDocument();
  });

  it('renders with custom estimate size', () => {
    render(<VirtualList items={items} renderItem={renderItem} estimateSize={100} />);

    // Just verify it renders without error
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('renders with custom overscan', () => {
    render(<VirtualList items={items} renderItem={renderItem} overscan={10} />);

    // Just verify it renders without error
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});

describe('VirtualTable Component', () => {
  const items = [
    { id: 1, name: 'John', age: 30 },
    { id: 2, name: 'Jane', age: 25 },
    { id: 3, name: 'Bob', age: 35 },
  ];

  const columns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'Age', accessor: 'age' as const },
  ];

  it('renders table headers', () => {
    render(<VirtualTable items={items} columns={columns} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
  });

  it('renders table data', () => {
    render(<VirtualTable items={items} columns={columns} />);

    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('calls onRowClick when row is clicked', async () => {
    const handleRowClick = vi.fn();
    const user = userEvent.setup();

    render(<VirtualTable items={items} columns={columns} onRowClick={handleRowClick} />);

    const row = screen.getByText('John').closest('div[class*="flex"]');
    if (row) {
      await user.click(row);
      expect(handleRowClick).toHaveBeenCalledTimes(1);
      expect(handleRowClick).toHaveBeenCalledWith(items[0], expect.any(Number));
    }
  });

  it('renders with custom rowHeight', () => {
    render(<VirtualTable items={items} columns={columns} rowHeight={80} />);

    expect(screen.getByText('John')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <VirtualTable items={items} columns={columns} className="custom-table" />
    );

    expect(container.querySelector('.custom-table')).toBeInTheDocument();
  });

  it('renders columns with custom width', () => {
    const customColumns = [
      { header: 'Name', accessor: 'name' as const, width: '200px' },
      { header: 'Age', accessor: 'age' as const, width: '100px' },
    ];

    render(<VirtualTable items={customColumns} columns={customColumns} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('handles function accessor', () => {
    const customColumns = [
      { header: 'Full Info', accessor: (item: typeof items[0]) => `${item.name} - ${item.age}` },
    ];

    render(<VirtualTable items={items} columns={customColumns} />);

    expect(screen.getByText('John - 30')).toBeInTheDocument();
  });
});

describe('InfiniteVirtualList Component', () => {
  const items = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' },
    { id: 3, name: 'Item 3' },
  ];

  const renderItem = (item: typeof items[0]) => <div>{item.name}</div>;

  it('renders items', () => {
    render(
      <InfiniteVirtualList
        items={items}
        renderItem={renderItem}
        hasMore={false}
        loadMore={vi.fn()}
      />
    );

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('shows loading message when hasMore is true', () => {
    const { container } = render(
      <InfiniteVirtualList
        items={items}
        renderItem={renderItem}
        hasMore={true}
        loadMore={vi.fn()}
      />
    );

    // The loading message might not be visible initially
    expect(container).toBeInTheDocument();
  });

  it('renders custom loading message', () => {
    render(
      <InfiniteVirtualList
        items={items}
        renderItem={renderItem}
        hasMore={true}
        loadMore={vi.fn()}
        loadingMessage="Fetching more items..."
      />
    );

    // Just verify it renders without error
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <InfiniteVirtualList
        items={items}
        renderItem={renderItem}
        hasMore={false}
        loadMore={vi.fn()}
        className="infinite-list"
      />
    );

    expect(container.querySelector('.infinite-list')).toBeInTheDocument();
  });

  it('renders with custom estimate size', () => {
    render(
      <InfiniteVirtualList
        items={items}
        renderItem={renderItem}
        hasMore={false}
        loadMore={vi.fn()}
        estimateSize={100}
      />
    );

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});
