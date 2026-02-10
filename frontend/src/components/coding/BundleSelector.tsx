import { useState } from 'react';

export interface BundleItem {
  code: string;
  codeType: 'CPT' | 'ICD10';
  description?: string;
}

export interface QuickPickBundle {
  id: string;
  name: string;
  description: string | null;
  items: BundleItem[];
  usageCount: number;
}

interface BundleSelectorProps {
  bundles: QuickPickBundle[];
  onApplyBundle: (bundle: QuickPickBundle) => void;
  isLoading?: boolean;
}

export function BundleSelector({
  bundles,
  onApplyBundle,
  isLoading = false,
}: BundleSelectorProps) {
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null);

  const handleToggleExpand = (bundleId: string) => {
    setExpandedBundleId(prev => prev === bundleId ? null : bundleId);
  };

  const handleApply = (bundle: QuickPickBundle) => {
    onApplyBundle(bundle);
  };

  if (bundles.length === 0) {
    return (
      <div className="bundle-selector-empty">
        <p>No code bundles available</p>
        <span>Create bundles from commonly used code combinations</span>
      </div>
    );
  }

  return (
    <div className="bundle-selector">
      <h4 className="bundle-selector-title">Code Bundles</h4>
      <div className="bundle-list">
        {bundles.map(bundle => (
          <div
            key={bundle.id}
            className={`bundle-card ${expandedBundleId === bundle.id ? 'expanded' : ''}`}
          >
            <div
              className="bundle-header"
              onClick={() => handleToggleExpand(bundle.id)}
            >
              <div className="bundle-info">
                <span className="bundle-name">{bundle.name}</span>
                {bundle.description && (
                  <span className="bundle-description">{bundle.description}</span>
                )}
              </div>
              <div className="bundle-meta">
                <span className="bundle-count">{bundle.items.length} codes</span>
                <span className="bundle-usage">{bundle.usageCount} uses</span>
              </div>
              <button
                type="button"
                className="bundle-expand-icon"
                aria-label={expandedBundleId === bundle.id ? 'Collapse' : 'Expand'}
              >
                {expandedBundleId === bundle.id ? '\u25B2' : '\u25BC'}
              </button>
            </div>

            {expandedBundleId === bundle.id && (
              <div className="bundle-details">
                <div className="bundle-items">
                  {bundle.items.map((item, index) => (
                    <div key={index} className="bundle-item">
                      <span className={`bundle-item-type ${item.codeType.toLowerCase()}`}>
                        {item.codeType}
                      </span>
                      <span className="bundle-item-code">{item.code}</span>
                      {item.description && (
                        <span className="bundle-item-desc">{item.description}</span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="bundle-apply-btn"
                  onClick={() => handleApply(bundle)}
                  disabled={isLoading}
                >
                  {isLoading ? 'Applying...' : 'Apply Bundle'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .bundle-selector {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .bundle-selector-title {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary, #64748b);
        }

        .bundle-selector-empty {
          padding: 1.5rem;
          text-align: center;
          color: var(--text-tertiary, #94a3b8);
        }

        .bundle-selector-empty p {
          margin: 0 0 0.25rem;
          font-weight: 500;
        }

        .bundle-selector-empty span {
          font-size: 0.75rem;
        }

        .bundle-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .bundle-card {
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 8px;
          overflow: hidden;
          transition: border-color 0.15s ease;
        }

        .bundle-card:hover {
          border-color: var(--primary-color, #3b82f6);
        }

        .bundle-card.expanded {
          border-color: var(--primary-color, #3b82f6);
        }

        .bundle-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          cursor: pointer;
          background: var(--surface-color, #fff);
        }

        .bundle-header:hover {
          background: var(--hover-color, #f8fafc);
        }

        .bundle-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .bundle-name {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--text-primary, #1e293b);
        }

        .bundle-description {
          font-size: 0.75rem;
          color: var(--text-tertiary, #94a3b8);
        }

        .bundle-meta {
          display: flex;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-secondary, #64748b);
        }

        .bundle-count {
          padding: 0.125rem 0.375rem;
          background: var(--surface-alt, #f1f5f9);
          border-radius: 4px;
        }

        .bundle-usage {
          color: var(--text-tertiary, #94a3b8);
        }

        .bundle-expand-icon {
          padding: 0.25rem;
          border: none;
          background: transparent;
          font-size: 0.625rem;
          color: var(--text-tertiary, #94a3b8);
          cursor: pointer;
        }

        .bundle-details {
          padding: 0.75rem;
          background: var(--surface-alt, #f8fafc);
          border-top: 1px solid var(--border-light, #f1f5f9);
        }

        .bundle-items {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          margin-bottom: 0.75rem;
        }

        .bundle-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
        }

        .bundle-item-type {
          padding: 0.125rem 0.25rem;
          border-radius: 3px;
          font-size: 0.625rem;
          font-weight: 600;
        }

        .bundle-item-type.cpt {
          background: var(--success-light, #dcfce7);
          color: var(--success-dark, #166534);
        }

        .bundle-item-type.icd10 {
          background: var(--primary-light, #dbeafe);
          color: var(--primary-dark, #1e40af);
        }

        .bundle-item-code {
          font-family: var(--font-mono, monospace);
          font-weight: 600;
          min-width: 50px;
        }

        .bundle-item-desc {
          color: var(--text-secondary, #64748b);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bundle-apply-btn {
          width: 100%;
          padding: 0.5rem;
          border: none;
          border-radius: 6px;
          background: var(--primary-color, #3b82f6);
          color: white;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .bundle-apply-btn:hover:not(:disabled) {
          background: var(--primary-dark, #2563eb);
        }

        .bundle-apply-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
