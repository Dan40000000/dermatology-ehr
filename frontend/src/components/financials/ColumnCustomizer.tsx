import { useState } from 'react';
import { Modal } from '../ui/Modal';

interface Column {
  key: string;
  label: string;
  visible: boolean;
}

interface ColumnCustomizerProps {
  columns: Column[];
  onApply: (columns: Column[]) => void;
}

export function ColumnCustomizer({ columns, onApply }: ColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localColumns, setLocalColumns] = useState<Column[]>(columns);

  const handleOpen = () => {
    setLocalColumns([...columns]);
    setIsOpen(true);
  };

  const handleToggle = (key: string) => {
    setLocalColumns(prev =>
      prev.map(col =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleApply = () => {
    onApply(localColumns);
    setIsOpen(false);
  };

  const handleReset = () => {
    const resetColumns = localColumns.map(col => ({ ...col, visible: true }));
    setLocalColumns(resetColumns);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          padding: '0.5rem 1rem',
          background: 'white',
          color: '#059669',
          border: '2px solid #059669',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '600',
        }}
      >
        Customize Columns
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Customize Columns"
        size="sm"
      >
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
            Select which columns to display in the table
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {localColumns.map(col => (
              <label
                key={col.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={col.visible}
                  onChange={() => handleToggle(col.key)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: '0.95rem', color: '#374151' }}>{col.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="modal-footer" style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '1rem',
          borderTop: '1px solid #e5e7eb',
        }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: '0.5rem 1rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            Reset
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                padding: '0.5rem 1rem',
                background: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              style={{
                padding: '0.5rem 1rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
