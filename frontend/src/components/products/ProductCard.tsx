import type { Product } from '../../types';

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
  onEdit?: (product: Product) => void;
  showInventory?: boolean;
  compact?: boolean;
}

export function ProductCard({
  product,
  onAddToCart,
  onEdit,
  showInventory = true,
  compact = false,
}: ProductCardProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'prescription':
        return '#dc2626';
      case 'skincare':
        return '#2563eb';
      case 'sunscreen':
        return '#f59e0b';
      case 'cosmetic':
        return '#ec4899';
      case 'post_procedure':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'prescription':
        return 'Rx';
      case 'skincare':
        return 'Skincare';
      case 'sunscreen':
        return 'SPF';
      case 'cosmetic':
        return 'Cosmetic';
      case 'post_procedure':
        return 'Post-Procedure';
      default:
        return category;
    }
  };

  const isLowStock = product.inventoryCount <= product.reorderPoint;
  const isOutOfStock = product.inventoryCount === 0;

  if (compact) {
    return (
      <div className="product-card-compact">
        <div className="product-info">
          <span
            className="category-badge"
            style={{ backgroundColor: getCategoryColor(product.category) }}
          >
            {getCategoryLabel(product.category)}
          </span>
          <span className="product-name">{product.name}</span>
          {product.brand && <span className="product-brand">{product.brand}</span>}
        </div>
        <div className="product-price">{formatCurrency(product.price)}</div>
        {onAddToCart && (
          <button
            type="button"
            className="btn-add-compact"
            onClick={() => onAddToCart(product)}
            disabled={isOutOfStock}
          >
            {isOutOfStock ? 'Out of Stock' : '+'}
          </button>
        )}

        <style>{`
          .product-card-compact {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            transition: all 0.2s ease;
          }

          .product-card-compact:hover {
            border-color: #2563eb;
            box-shadow: 0 2px 4px rgba(37, 99, 235, 0.1);
          }

          .product-info {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            min-width: 0;
          }

          .category-badge {
            padding: 0.125rem 0.5rem;
            border-radius: 4px;
            font-size: 0.625rem;
            font-weight: 600;
            color: white;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .product-name {
            font-weight: 500;
            color: #1f2937;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .product-brand {
            color: #6b7280;
            font-size: 0.875rem;
            white-space: nowrap;
          }

          .product-price {
            font-weight: 600;
            color: #059669;
            white-space: nowrap;
          }

          .btn-add-compact {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1.25rem;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .btn-add-compact:hover:not(:disabled) {
            background: #1d4ed8;
          }

          .btn-add-compact:disabled {
            background: #d1d5db;
            cursor: not-allowed;
            font-size: 0.625rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`product-card ${!product.isActive ? 'inactive' : ''}`}>
      <div className="card-header">
        <span
          className="category-badge"
          style={{ backgroundColor: getCategoryColor(product.category) }}
        >
          {getCategoryLabel(product.category)}
        </span>
        {!product.isActive && <span className="inactive-badge">Inactive</span>}
      </div>

      <div className="card-body">
        <h3 className="product-name">{product.name}</h3>
        {product.brand && <p className="product-brand">{product.brand}</p>}
        {product.description && (
          <p className="product-description">{product.description}</p>
        )}
        <p className="product-sku">SKU: {product.sku}</p>
      </div>

      <div className="card-pricing">
        <span className="price">{formatCurrency(product.price)}</span>
        {showInventory && (
          <span className={`stock ${isOutOfStock ? 'out' : isLowStock ? 'low' : ''}`}>
            {isOutOfStock
              ? 'Out of Stock'
              : isLowStock
              ? `Low: ${product.inventoryCount}`
              : `In Stock: ${product.inventoryCount}`}
          </span>
        )}
      </div>

      <div className="card-actions">
        {onAddToCart && (
          <button
            type="button"
            className="btn-add"
            onClick={() => onAddToCart(product)}
            disabled={isOutOfStock}
          >
            {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className="btn-edit"
            onClick={() => onEdit(product)}
          >
            Edit
          </button>
        )}
      </div>

      <style>{`
        .product-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
        }

        .product-card:hover {
          border-color: #2563eb;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
        }

        .product-card.inactive {
          opacity: 0.6;
        }

        .card-header {
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f3f4f6;
        }

        .category-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
          text-transform: uppercase;
        }

        .inactive-badge {
          padding: 0.25rem 0.5rem;
          background: #f3f4f6;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .card-body {
          padding: 1rem;
          flex: 1;
        }

        .product-name {
          margin: 0 0 0.25rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: #1f2937;
        }

        .product-brand {
          margin: 0 0 0.5rem 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .product-description {
          margin: 0 0 0.5rem 0;
          font-size: 0.875rem;
          color: #4b5563;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .product-sku {
          margin: 0;
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .card-pricing {
          padding: 0.75rem 1rem;
          background: #f9fafb;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .price {
          font-size: 1.25rem;
          font-weight: 700;
          color: #059669;
        }

        .stock {
          font-size: 0.875rem;
          font-weight: 500;
          color: #10b981;
        }

        .stock.low {
          color: #f59e0b;
        }

        .stock.out {
          color: #dc2626;
        }

        .card-actions {
          padding: 0.75rem 1rem;
          display: flex;
          gap: 0.5rem;
          border-top: 1px solid #f3f4f6;
        }

        .btn-add {
          flex: 1;
          padding: 0.625rem 1rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-add:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .btn-add:disabled {
          background: #d1d5db;
          cursor: not-allowed;
        }

        .btn-edit {
          padding: 0.625rem 1rem;
          background: white;
          color: #4b5563;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-edit:hover {
          background: #f3f4f6;
          border-color: #9ca3af;
        }
      `}</style>
    </div>
  );
}
