import { useState } from 'react';
import { Modal } from '../ui';

interface FeeScheduleItem {
  id: string;
  cptCode: string;
  description: string;
  category: string;
  standardFeeCents: number;
  medicareRateCents: number;
  allowedVariance: number;
  modifiers: string[];
  effectiveDate: string;
  expirationDate?: string;
  isActive: boolean;
}

interface PayerContract {
  id: string;
  payerName: string;
  payerId: string;
  contractType: 'fee-schedule' | 'percentage' | 'hybrid';
  percentageOfMedicare?: number;
  effectiveDate: string;
  expirationDate: string;
  autoRenewal: boolean;
  status: 'active' | 'pending' | 'expired' | 'terminated';
}

interface Props {
  onSave?: (item: FeeScheduleItem) => void;
}

const MOCK_FEE_SCHEDULE: FeeScheduleItem[] = [
  {
    id: '1',
    cptCode: '99213',
    description: 'Office or other outpatient visit, established patient',
    category: 'E/M',
    standardFeeCents: 15000,
    medicareRateCents: 9800,
    allowedVariance: 15,
    modifiers: ['25', '59'],
    effectiveDate: '2026-01-01',
    isActive: true,
  },
  {
    id: '2',
    cptCode: '99214',
    description: 'Office or other outpatient visit, moderate complexity',
    category: 'E/M',
    standardFeeCents: 20000,
    medicareRateCents: 14500,
    allowedVariance: 15,
    modifiers: ['25', '59'],
    effectiveDate: '2026-01-01',
    isActive: true,
  },
  {
    id: '3',
    cptCode: '11102',
    description: 'Tangential biopsy of skin, single lesion',
    category: 'Surgery',
    standardFeeCents: 17500,
    medicareRateCents: 12000,
    allowedVariance: 10,
    modifiers: ['59', 'XE', 'XS'],
    effectiveDate: '2026-01-01',
    isActive: true,
  },
  {
    id: '4',
    cptCode: '17311',
    description: 'Mohs surgery, first stage, up to 5 tissue blocks',
    category: 'Surgery',
    standardFeeCents: 85000,
    medicareRateCents: 72000,
    allowedVariance: 5,
    modifiers: [],
    effectiveDate: '2026-01-01',
    isActive: true,
  },
  {
    id: '5',
    cptCode: '17000',
    description: 'Destruction benign/premalignant lesion, first',
    category: 'Surgery',
    standardFeeCents: 8500,
    medicareRateCents: 6200,
    allowedVariance: 15,
    modifiers: ['59'],
    effectiveDate: '2026-01-01',
    isActive: true,
  },
  {
    id: '6',
    cptCode: '96372',
    description: 'Therapeutic injection, subcutaneous/intramuscular',
    category: 'Injections',
    standardFeeCents: 4500,
    medicareRateCents: 2800,
    allowedVariance: 20,
    modifiers: ['59'],
    effectiveDate: '2026-01-01',
    isActive: true,
  },
];

const MOCK_CONTRACTS: PayerContract[] = [
  {
    id: '1',
    payerName: 'Blue Cross Blue Shield',
    payerId: 'BCBS',
    contractType: 'percentage',
    percentageOfMedicare: 125,
    effectiveDate: '2025-01-01',
    expirationDate: '2026-12-31',
    autoRenewal: true,
    status: 'active',
  },
  {
    id: '2',
    payerName: 'Aetna',
    payerId: 'AETNA',
    contractType: 'fee-schedule',
    effectiveDate: '2025-06-01',
    expirationDate: '2026-05-31',
    autoRenewal: true,
    status: 'active',
  },
  {
    id: '3',
    payerName: 'UnitedHealthcare',
    payerId: 'UHC',
    contractType: 'hybrid',
    percentageOfMedicare: 115,
    effectiveDate: '2025-03-01',
    expirationDate: '2026-02-28',
    autoRenewal: false,
    status: 'active',
  },
  {
    id: '4',
    payerName: 'Cigna',
    payerId: 'CIGNA',
    contractType: 'percentage',
    percentageOfMedicare: 120,
    effectiveDate: '2024-01-01',
    expirationDate: '2025-12-31',
    autoRenewal: true,
    status: 'expired',
  },
];

const CATEGORIES = ['All', 'E/M', 'Surgery', 'Injections', 'Labs', 'Pathology'];

export function FeeScheduleManager({ onSave }: Props) {
  const [activeTab, setActiveTab] = useState<'fees' | 'contracts' | 'packages'>('fees');
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleItem[]>(MOCK_FEE_SCHEDULE);
  const [contracts] = useState<PayerContract[]>(MOCK_CONTRACTS);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<FeeScheduleItem | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const filteredFees = feeSchedule.filter(item => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
    if (searchTerm && !item.cptCode.includes(searchTerm) && !item.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const handleEditFee = (item: FeeScheduleItem) => {
    setEditingItem({ ...item });
    setShowEditModal(true);
  };

  const handleSaveFee = () => {
    if (!editingItem) return;

    setFeeSchedule(fees =>
      fees.map(fee => fee.id === editingItem.id ? editingItem : fee)
    );
    onSave?.(editingItem);
    setShowEditModal(false);
    setEditingItem(null);
  };

  const getContractStatus = (contract: PayerContract) => {
    const expDate = new Date(contract.expirationDate);
    const today = new Date();
    const daysUntilExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (contract.status === 'expired') return { color: '#dc2626', bg: '#fee2e2', text: 'Expired' };
    if (daysUntilExpiry <= 30) return { color: '#f59e0b', bg: '#fef3c7', text: `Expires in ${daysUntilExpiry}d` };
    if (daysUntilExpiry <= 90) return { color: '#f59e0b', bg: '#fef3c7', text: 'Renewal Soon' };
    return { color: '#059669', bg: '#dcfce7', text: 'Active' };
  };

  return (
    <div className="fee-schedule-manager">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
            Fee Schedule Management
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            Manage procedure fees, payer contracts, and service packages
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            style={{
              padding: '0.75rem 1.25rem',
              background: 'white',
              color: '#374151',
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Import Schedule
          </button>
          <button
            style={{
              padding: '0.75rem 1.25rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            + Add Fee
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '0.5rem',
      }}>
        {[
          { key: 'fees', label: 'Fee Schedule' },
          { key: 'contracts', label: 'Payer Contracts' },
          { key: 'packages', label: 'Service Packages' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab.key ? '#059669' : '#6b7280',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '3px solid #059669' : '3px solid transparent',
              marginBottom: '-0.6rem',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fee Schedule Tab */}
      {activeTab === 'fees' && (
        <div>
          {/* Filters */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#f9fafb',
            borderRadius: '8px',
            alignItems: 'center',
          }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="Search by CPT code or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '6px',
                    background: selectedCategory === cat ? '#059669' : 'white',
                    color: selectedCategory === cat ? 'white' : '#6b7280',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Fee Schedule Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>CPT Code</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Description</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Category</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Standard Fee</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Medicare Rate</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Modifiers</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', textTransform: 'uppercase', color: '#6b7280' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFees.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem', fontWeight: '600', color: '#111827', fontFamily: 'monospace' }}>
                      {item.cptCode}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#374151', maxWidth: '300px' }}>
                      {item.description}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: '#f0f9ff',
                        color: '#0369a1',
                      }}>
                        {item.category}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#111827' }}>
                      {formatCurrency(item.standardFeeCents)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#6b7280' }}>
                      {formatCurrency(item.medicareRateCents)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      {item.modifiers.length > 0 ? (
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                          {item.modifiers.map(mod => (
                            <span key={mod} style={{
                              padding: '0.2rem 0.4rem',
                              background: '#f3f4f6',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                            }}>
                              {mod}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: item.isActive ? '#dcfce7' : '#f3f4f6',
                        color: item.isActive ? '#166534' : '#6b7280',
                      }}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleEditFee(item)}
                        style={{
                          padding: '0.4rem 0.75rem',
                          background: 'white',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontWeight: '600',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contracts Tab */}
      {activeTab === 'contracts' && (
        <div>
          {/* Contract Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            <div style={{
              background: '#dcfce7',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '2px solid #bbf7d0',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#166534', marginBottom: '0.5rem', fontWeight: '600' }}>
                Active Contracts
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>
                {contracts.filter(c => c.status === 'active').length}
              </div>
            </div>
            <div style={{
              background: '#fef3c7',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '2px solid #fde68a',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '0.5rem', fontWeight: '600' }}>
                Expiring Soon
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f59e0b' }}>
                {contracts.filter(c => {
                  const daysLeft = Math.ceil((new Date(c.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return daysLeft > 0 && daysLeft <= 90;
                }).length}
              </div>
            </div>
            <div style={{
              background: '#fee2e2',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '2px solid #fecaca',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#991b1b', marginBottom: '0.5rem', fontWeight: '600' }}>
                Expired
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#dc2626' }}>
                {contracts.filter(c => c.status === 'expired').length}
              </div>
            </div>
            <div style={{
              background: '#f0f9ff',
              borderRadius: '12px',
              padding: '1.25rem',
              border: '2px solid #bae6fd',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#0369a1', marginBottom: '0.5rem', fontWeight: '600' }}>
                Auto-Renewal
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0ea5e9' }}>
                {contracts.filter(c => c.autoRenewal).length}
              </div>
            </div>
          </div>

          {/* Contracts List */}
          <div style={{ display: 'grid', gap: '1rem' }}>
            {contracts.map(contract => {
              const status = getContractStatus(contract);
              return (
                <div
                  key={contract.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #e5e7eb',
                    padding: '1.5rem',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '1rem',
                  }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
                        {contract.payerName}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                        Payer ID: {contract.payerId}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {contract.autoRenewal && (
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: '#f0f9ff',
                          color: '#0369a1',
                        }}>
                          Auto-Renewal
                        </span>
                      )}
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: status.bg,
                        color: status.color,
                      }}>
                        {status.text}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '1.5rem',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Contract Type</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#374151', textTransform: 'capitalize' }}>
                        {contract.contractType.replace('-', ' ')}
                      </div>
                    </div>
                    {contract.percentageOfMedicare && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>% of Medicare</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#059669' }}>
                          {contract.percentageOfMedicare}%
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Effective Date</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#374151' }}>
                        {formatDate(contract.effectiveDate)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Expiration Date</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#374151' }}>
                        {formatDate(contract.expirationDate)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button style={{
                      padding: '0.5rem 1rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}>
                      View Details
                    </button>
                    <button style={{
                      padding: '0.5rem 1rem',
                      background: 'white',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}>
                      View Fee Schedule
                    </button>
                    {contract.status !== 'expired' && (
                      <button style={{
                        padding: '0.5rem 1rem',
                        background: 'white',
                        color: '#374151',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}>
                        Renew Contract
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowContractModal(true)}
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            + Add New Contract
          </button>
        </div>
      )}

      {/* Packages Tab */}
      {activeTab === 'packages' && (
        <div>
          <div style={{
            background: '#f0fdf4',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '2rem',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#065f46', marginBottom: '0.5rem' }}>
              Service Packages
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Create bundled service packages for common procedures
            </p>
            <button
              style={{
                padding: '0.75rem 2rem',
                background: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              + Create Package
            </button>
          </div>

          {/* Sample Packages */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {[
              {
                name: 'Skin Check Package',
                description: 'Full body skin examination with up to 3 biopsies',
                items: ['99214 - Office Visit', '11102 x3 - Biopsies'],
                standardPrice: 52500,
                packagePrice: 45000,
              },
              {
                name: 'Acne Treatment Package',
                description: '3-month acne treatment program with follow-ups',
                items: ['99213 x3 - Office Visits', '96372 x3 - Injections', 'J3301 - Kenalog'],
                standardPrice: 75000,
                packagePrice: 60000,
              },
            ].map((pkg, i) => (
              <div key={i} style={{
                background: 'white',
                borderRadius: '12px',
                border: '2px solid #e5e7eb',
                padding: '1.5rem',
              }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
                  {pkg.name}
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
                  {pkg.description}
                </p>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Included Services:
                  </div>
                  {pkg.items.map((item, j) => (
                    <div key={j} style={{ fontSize: '0.85rem', color: '#374151', padding: '0.25rem 0' }}>
                      • {item}
                    </div>
                  ))}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '8px',
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Standard Price</div>
                    <div style={{ fontSize: '1rem', color: '#6b7280', textDecoration: 'line-through' }}>
                      {formatCurrency(pkg.standardPrice)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>Package Price</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
                      {formatCurrency(pkg.packagePrice)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button style={{
                    flex: 1,
                    padding: '0.5rem 1rem',
                    background: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}>
                    Edit
                  </button>
                  <button style={{
                    flex: 1,
                    padding: '0.5rem 1rem',
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}>
                    Apply to Patient
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Fee Modal */}
      <Modal
        isOpen={showEditModal}
        title="Edit Fee Schedule Item"
        onClose={() => {
          setShowEditModal(false);
          setEditingItem(null);
        }}
      >
        {editingItem && (
          <div>
            <div style={{
              background: '#f9fafb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>
                {editingItem.cptCode}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                {editingItem.description}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                  Standard Fee
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={(editingItem.standardFeeCents / 100).toFixed(2)}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    standardFeeCents: Math.round(parseFloat(e.target.value) * 100) || 0,
                  })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                  Medicare Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={(editingItem.medicareRateCents / 100).toFixed(2)}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    medicareRateCents: Math.round(parseFloat(e.target.value) * 100) || 0,
                  })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                Allowed Variance (%)
              </label>
              <input
                type="number"
                value={editingItem.allowedVariance}
                onChange={(e) => setEditingItem({
                  ...editingItem,
                  allowedVariance: parseInt(e.target.value) || 0,
                })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editingItem.isActive}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    isActive: e.target.checked,
                  })}
                />
                <span style={{ fontSize: '0.9rem', color: '#374151' }}>Active</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'white',
                  color: '#374151',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFee}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
