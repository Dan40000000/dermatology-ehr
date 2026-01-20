import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';

interface CosmeticProcedure {
  id: string;
  cptCode: string;
  description: string;
  category: string;
  subcategory: string;
  units: string;
  baseFee_cents: number;
  minPriceCents: number;
  maxPriceCents: number;
  typicalUnits: number;
  packageSessions: number;
  notes: string;
}

interface Category {
  id: string;
  categoryName: string;
  displayName: string;
  description: string;
  sortOrder: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  neurotoxins: '💉',
  dermal_fillers: '💧',
  body_contouring: '✨',
  laser_hair_removal: '⚡',
  laser_skin: '🔬',
  chemical_peels: '🧪',
  microneedling: '🔱',
  other_cosmetic: '✨',
};

export function CosmeticPricingPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [procedures, setProcedures] = useState<CosmeticProcedure[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const loadCategories = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/fee-schedules/cosmetic/categories`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load categories');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load categories');
    }
  }, [session, showError]);

  const loadProcedures = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/fee-schedules/cosmetic/pricing?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load procedures');
      const data = await response.json();
      setProcedures(data.procedures || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load cosmetic procedures');
    } finally {
      setLoading(false);
    }
  }, [session, selectedCategory, searchQuery, showError]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProcedures();
  }, [loadProcedures]);

  const formatCurrency = (cents: number | null) => {
    if (!cents) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatPriceRange = (min: number | null, max: number | null) => {
    if (!min && !max) return 'Contact for pricing';
    if (min && max && min !== max) {
      return `${formatCurrency(min)} - ${formatCurrency(max)}`;
    }
    return formatCurrency(min || max);
  };

  const groupedProcedures = procedures.reduce((acc, proc) => {
    const cat = proc.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(proc);
    return acc;
  }, {} as Record<string, CosmeticProcedure[]>);

  if (loading && procedures.length === 0) {
    return (
      <div className="cosmetic-pricing-page">
        <div className="page-header">
          <h1>Cosmetic Dermatology Pricing</h1>
        </div>
        <Skeleton variant="card" height={600} />
      </div>
    );
  }

  return (
    <div className="cosmetic-pricing-page">
      <div className="page-header">
        <div>
          <h1>Cosmetic Dermatology Pricing</h1>
          <p className="page-subtitle">
            Comprehensive aesthetic services pricing guide
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <Panel title="">
        <div className="cosmetic-filters">
          <div className="search-section">
            <input
              type="text"
              placeholder="Search procedures..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <div className="category-filters">
            <button
              className={`category-chip ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.categoryName}
                className={`category-chip ${selectedCategory === cat.categoryName ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.categoryName)}
              >
                <span className="category-icon">
                  {CATEGORY_ICONS[cat.categoryName] || '✨'}
                </span>
                {cat.displayName}
              </button>
            ))}
          </div>

          <div className="view-toggle">
            <button
              className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              ⊞
            </button>
            <button
              className={`btn-icon ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              ☰
            </button>
          </div>
        </div>
      </Panel>

      {/* Results Count */}
      <div className="results-info">
        <p className="muted">
          Showing {procedures.length} procedure{procedures.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="cosmetic-grid">
          {Object.entries(groupedProcedures).map(([categoryKey, procs]) => {
            const categoryInfo = categories.find((c) => c.categoryName === categoryKey);
            return (
              <div key={categoryKey} className="category-section">
                <div className="category-header">
                  <span className="category-icon-large">
                    {CATEGORY_ICONS[categoryKey] || '✨'}
                  </span>
                  <div>
                    <h2>{categoryInfo?.displayName || categoryKey}</h2>
                    {categoryInfo?.description && (
                      <p className="muted tiny">{categoryInfo.description}</p>
                    )}
                  </div>
                </div>

                <div className="procedure-cards">
                  {procs.map((proc) => (
                    <div key={proc.id} className="procedure-card">
                      <div className="procedure-header">
                        <h3>{proc.description}</h3>
                        {proc.subcategory && (
                          <span className="pill tiny">{proc.subcategory.replace(/_/g, ' ')}</span>
                        )}
                      </div>

                      <div className="procedure-details">
                        {proc.typicalUnits && (
                          <div className="detail-row">
                            <span className="label">Typical:</span>
                            <span className="value">
                              {proc.typicalUnits} {proc.units || 'units'}
                            </span>
                          </div>
                        )}

                        {proc.packageSessions && (
                          <div className="detail-row">
                            <span className="label">Sessions:</span>
                            <span className="value">{proc.packageSessions} sessions</span>
                          </div>
                        )}

                        <div className="price-display">
                          <div className="price-range">
                            {formatPriceRange(proc.minPriceCents, proc.maxPriceCents)}
                          </div>
                          {proc.units && proc.units !== 'package' && (
                            <div className="price-unit muted tiny">{proc.units}</div>
                          )}
                        </div>

                        {proc.notes && (
                          <div className="procedure-notes">
                            <p className="muted tiny">{proc.notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="procedure-footer">
                        <span className="cpt-code muted tiny">CPT: {proc.cptCode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <Panel title="Procedures">
          <div className="cosmetic-table">
            <table>
              <thead>
                <tr>
                  <th>Procedure</th>
                  <th>Category</th>
                  <th>Typical Amount</th>
                  <th>Price Range</th>
                  <th>CPT Code</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((proc) => (
                  <tr key={proc.id}>
                    <td className="strong">{proc.description}</td>
                    <td>
                      <span className="pill tiny">
                        {proc.category?.replace(/_/g, ' ') || 'Other'}
                      </span>
                    </td>
                    <td>
                      {proc.typicalUnits
                        ? `${proc.typicalUnits} ${proc.units || 'units'}`
                        : '-'}
                    </td>
                    <td className="strong">
                      {formatPriceRange(proc.minPriceCents, proc.maxPriceCents)}
                    </td>
                    <td className="muted">{proc.cptCode}</td>
                    <td className="muted tiny" style={{ maxWidth: '300px' }}>
                      {proc.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {procedures.length === 0 && !loading && (
        <Panel title="">
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <p className="muted">No procedures found matching your search criteria.</p>
            <button
              className="btn-primary"
              style={{ marginTop: '20px' }}
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              Clear Filters
            </button>
          </div>
        </Panel>
      )}

      <style jsx>{`
        .cosmetic-pricing-page {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .page-header h1 {
          font-size: 32px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 8px 0;
        }

        .page-subtitle {
          font-size: 16px;
          color: #6b7280;
          margin: 0;
        }

        .cosmetic-filters {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .search-section {
          display: flex;
          gap: 12px;
        }

        .search-input {
          flex: 1;
          padding: 12px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
        }

        .category-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .category-chip {
          padding: 8px 16px;
          border: 2px solid #e5e7eb;
          background: white;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .category-chip:hover {
          border-color: #059669;
          background: #f0fdf4;
        }

        .category-chip.active {
          border-color: #059669;
          background: #059669;
          color: white;
        }

        .category-icon {
          font-size: 16px;
        }

        .view-toggle {
          display: flex;
          gap: 8px;
          margin-left: auto;
        }

        .btn-icon {
          width: 40px;
          height: 40px;
          border: 2px solid #e5e7eb;
          background: white;
          border-radius: 8px;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-icon:hover {
          border-color: #059669;
          background: #f0fdf4;
        }

        .btn-icon.active {
          border-color: #059669;
          background: #059669;
          color: white;
        }

        .results-info {
          margin: 16px 0;
        }

        .category-section {
          margin-bottom: 48px;
        }

        .category-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 3px solid #e5e7eb;
        }

        .category-icon-large {
          font-size: 48px;
        }

        .category-header h2 {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .procedure-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }

        .procedure-card {
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }

        .procedure-card:hover {
          border-color: #059669;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .procedure-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 16px;
        }

        .procedure-header h3 {
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          margin: 0;
          flex: 1;
        }

        .procedure-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .detail-row .label {
          color: #6b7280;
          font-weight: 500;
        }

        .detail-row .value {
          color: #111827;
          font-weight: 600;
        }

        .price-display {
          background: #f0fdf4;
          border: 2px solid #bbf7d0;
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          margin: 8px 0;
        }

        .price-range {
          font-size: 20px;
          font-weight: 800;
          color: #059669;
        }

        .price-unit {
          margin-top: 4px;
        }

        .procedure-notes {
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
          margin-top: 8px;
        }

        .procedure-notes p {
          margin: 0;
          line-height: 1.5;
        }

        .procedure-footer {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .cpt-code {
          font-family: monospace;
        }

        .cosmetic-table {
          overflow-x: auto;
        }

        .cosmetic-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .cosmetic-table th {
          text-align: left;
          padding: 12px;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-size: 12px;
          text-transform: uppercase;
          color: #6b7280;
          font-weight: 600;
        }

        .cosmetic-table td {
          padding: 12px;
          border-bottom: 1px solid #f3f4f6;
        }

        .cosmetic-table tr:hover {
          background: #f9fafb;
        }

        .pill {
          display: inline-block;
          padding: 4px 12px;
          background: #f0f9ff;
          color: #0369a1;
          border-radius: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }

        .pill.tiny {
          font-size: 11px;
          padding: 3px 8px;
        }

        .strong {
          font-weight: 600;
          color: #111827;
        }

        .muted {
          color: #6b7280;
        }

        .muted.tiny {
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
