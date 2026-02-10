import { useState } from 'react';

export interface QuickPickCategory {
  id: string;
  name: string;
  displayOrder: number;
  icon: string | null;
  color: string | null;
}

interface CategoryTabsProps {
  categories: QuickPickCategory[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  showAllTab?: boolean;
  showDiagnosesTab?: boolean;
  showProceduresTab?: boolean;
}

export function CategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
  showAllTab = true,
  showDiagnosesTab = true,
  showProceduresTab = true,
}: CategoryTabsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Separate diagnosis and procedure categories based on display_order
  // Categories with order < 10 are diagnoses, >= 10 are procedures
  const diagnosisCategories = categories.filter(c => c.displayOrder < 10);
  const procedureCategories = categories.filter(c => c.displayOrder >= 10);

  const visibleCategories = isExpanded ? categories : categories.slice(0, 8);

  return (
    <div className="category-tabs">
      <div className="category-tabs-header">
        {showAllTab && (
          <button
            type="button"
            className={`category-tab ${selectedCategory === null ? 'active' : ''}`}
            onClick={() => onSelectCategory(null)}
          >
            All
          </button>
        )}

        {showDiagnosesTab && diagnosisCategories.length > 0 && (
          <div className="category-group">
            <span className="category-group-label">Diagnoses</span>
            <div className="category-group-tabs">
              {diagnosisCategories.map(category => (
                <button
                  key={category.id}
                  type="button"
                  className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
                  onClick={() => onSelectCategory(category.id)}
                  style={category.color ? { '--tab-color': category.color } as React.CSSProperties : undefined}
                >
                  {category.icon && <span className="category-icon">{category.icon}</span>}
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {showProceduresTab && procedureCategories.length > 0 && (
          <div className="category-group">
            <span className="category-group-label">Procedures</span>
            <div className="category-group-tabs">
              {procedureCategories.map(category => (
                <button
                  key={category.id}
                  type="button"
                  className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
                  onClick={() => onSelectCategory(category.id)}
                  style={category.color ? { '--tab-color': category.color } as React.CSSProperties : undefined}
                >
                  {category.icon && <span className="category-icon">{category.icon}</span>}
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {categories.length > 8 && (
        <button
          type="button"
          className="category-expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Show Less' : `Show All (${categories.length})`}
        </button>
      )}

      <style>{`
        .category-tabs {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .category-tabs-header {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .category-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .category-group-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-tertiary, #94a3b8);
          padding-left: 0.25rem;
        }

        .category-group-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.375rem;
        }

        .category-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--border-color, #e0e0e0);
          border-radius: 9999px;
          background: var(--surface-color, #fff);
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary, #64748b);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .category-tab:hover {
          border-color: var(--tab-color, var(--primary-color, #3b82f6));
          color: var(--tab-color, var(--primary-color, #3b82f6));
          background: var(--hover-color, #f8fafc);
        }

        .category-tab.active {
          border-color: var(--tab-color, var(--primary-color, #3b82f6));
          background: var(--tab-color, var(--primary-color, #3b82f6));
          color: white;
        }

        .category-icon {
          font-size: 0.875rem;
        }

        .category-expand-btn {
          align-self: flex-start;
          padding: 0.25rem 0.5rem;
          border: none;
          background: transparent;
          font-size: 0.75rem;
          color: var(--primary-color, #3b82f6);
          cursor: pointer;
          text-decoration: underline;
        }

        .category-expand-btn:hover {
          color: var(--primary-dark, #2563eb);
        }
      `}</style>
    </div>
  );
}
