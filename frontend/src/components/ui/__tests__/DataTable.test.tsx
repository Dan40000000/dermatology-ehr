import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '../DataTable';

interface Row {
  id: string;
  name: string;
  age: number;
}

const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'age', label: 'Age', sortable: true },
];

const rows: Row[] = [
  { id: 'row-1', name: 'Zelda', age: 44 },
  { id: 'row-2', name: 'Ana', age: 30 },
  { id: 'row-3', name: 'Mike', age: 38 },
];

describe('DataTable', () => {
  it('renders empty and loading states', () => {
    const { rerender } = render(
      <DataTable columns={columns} data={[]} keyExtractor={(row) => row.id} emptyMessage="Empty" />
    );

    expect(screen.getByText('Empty')).toBeInTheDocument();

    rerender(
      <DataTable columns={columns} data={rows} keyExtractor={(row) => row.id} loading />
    );

    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled();
    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('sorts, paginates, and manages selection', () => {
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(row) => row.id}
        onSelectionChange={onSelectionChange}
        itemsPerPage={1}
      />
    );

    expect(screen.getByText('Zelda')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Name'));
    expect(screen.getByText('Ana')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Name'));
    expect(screen.getByText('Zelda')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Mike')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));

    const selectAll = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAll);
    expect(onSelectionChange).toHaveBeenCalledWith(['row-1']);

    const rowCheckbox = within(screen.getAllByRole('row')[1]).getByRole('checkbox');
    fireEvent.click(rowCheckbox);
    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });
});
