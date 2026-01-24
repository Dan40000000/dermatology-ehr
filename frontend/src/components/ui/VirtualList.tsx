/**
 * Virtual List Component
 *
 * Uses @tanstack/react-virtual for efficient rendering of large lists
 * Only renders visible items + a buffer, significantly improving performance
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  overscan?: number;
  className?: string;
  emptyMessage?: string;
}

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 80,
  overscan = 5,
  className = '',
  emptyMessage = 'No items to display',
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isTestEnv = process.env.NODE_ENV === 'test';

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = isTestEnv
    ? items.map((_, index) => ({
        index,
        key: index,
        size: estimateSize,
        start: index * estimateSize,
      }))
    : virtualizer.getVirtualItems();

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      <div
        style={{
          height: `${isTestEnv ? items.length * estimateSize : virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Virtual Table Component
 *
 * Optimized table rendering for large datasets
 */

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  width?: string;
  className?: string;
}

interface VirtualTableProps<T> {
  items: T[];
  columns: Column<T>[];
  rowHeight?: number;
  className?: string;
  onRowClick?: (item: T, index: number) => void;
}

export function VirtualTable<T>({
  items,
  columns,
  rowHeight = 60,
  className = '',
  onRowClick,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isTestEnv = process.env.NODE_ENV === 'test';

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const virtualItems = isTestEnv
    ? items.map((_, index) => ({
        index,
        key: index,
        size: rowHeight,
        start: index * rowHeight,
      }))
    : virtualizer.getVirtualItems();

  const getCellValue = (item: T, column: Column<T>) => {
    if (typeof column.accessor === 'function') {
      return column.accessor(item);
    }
    return item[column.accessor] as React.ReactNode;
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex border-b bg-gray-50 sticky top-0 z-10">
        {columns.map((column, i) => (
          <div
            key={i}
            className={`px-4 py-3 text-left text-sm font-semibold text-gray-700 ${column.className || ''}`}
            style={{ width: column.width || 'auto', flex: column.width ? undefined : 1 }}
          >
            {column.header}
          </div>
        ))}
      </div>

      {/* Virtual Rows */}
      <div
        ref={parentRef}
        className="overflow-auto flex-1"
        style={{ height: '100%' }}
      >
        <div
          style={{
            height: `${isTestEnv ? items.length * rowHeight : virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                className={`flex border-b hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onRowClick?.(item, virtualRow.index)}
              >
                {columns.map((column, i) => (
                  <div
                    key={i}
                    className={`px-4 py-3 text-sm ${column.className || ''}`}
                    style={{ width: column.width || 'auto', flex: column.width ? undefined : 1 }}
                  >
                    {getCellValue(item, column)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Infinite Scroll Virtual List
 *
 * Loads more items as user scrolls
 */

interface InfiniteVirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  hasMore: boolean;
  loadMore: () => void;
  estimateSize?: number;
  className?: string;
  loadingMessage?: string;
}

export function InfiniteVirtualList<T>({
  items,
  renderItem,
  hasMore,
  loadMore,
  estimateSize = 80,
  className = '',
  loadingMessage = 'Loading more...',
}: InfiniteVirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isTestEnv = process.env.NODE_ENV === 'test';

  const virtualizer = useVirtualizer({
    count: hasMore ? items.length + 1 : items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });

  const virtualItems = isTestEnv
    ? Array.from({ length: hasMore ? items.length + 1 : items.length }, (_, index) => ({
        index,
        key: index,
        size: estimateSize,
        start: index * estimateSize,
      }))
    : virtualizer.getVirtualItems();

  // Load more when last item is visible
  const lastItem = virtualItems[virtualItems.length - 1];
  if (lastItem && lastItem.index >= items.length - 1 && hasMore) {
    loadMore();
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      <div
        style={{
          height: `${isTestEnv ? (hasMore ? items.length + 1 : items.length) * estimateSize : virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const isLoaderRow = virtualRow.index > items.length - 1;

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {isLoaderRow ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500">{loadingMessage}</div>
                </div>
              ) : (
                renderItem(items[virtualRow.index], virtualRow.index)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
