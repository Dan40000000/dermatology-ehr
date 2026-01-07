import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton, Modal } from '../components/ui';
import { fetchPatients } from '../api';
import type { Patient } from '../types';

type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

interface QuoteItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Quote {
  id: string;
  patientId: string;
  createdAt: string;
  expiresAt: string;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  discountType: 'percent' | 'fixed';
  total: number;
  status: QuoteStatus;
  notes?: string;
}

const COSMETIC_PROCEDURES = [
  { code: 'BOT-001', description: 'Botox (per unit)', price: 14 },
  { code: 'BOT-002', description: 'Botox - Glabellar Lines (20 units)', price: 280 },
  { code: 'BOT-003', description: 'Botox - Crow\'s Feet (24 units)', price: 336 },
  { code: 'BOT-004', description: 'Botox - Forehead (20 units)', price: 280 },
  { code: 'FIL-001', description: 'Juvederm Ultra XC (1 syringe)', price: 650 },
  { code: 'FIL-002', description: 'Juvederm Voluma XC (1 syringe)', price: 850 },
  { code: 'FIL-003', description: 'Restylane (1 syringe)', price: 600 },
  { code: 'FIL-004', description: 'Sculptra (1 vial)', price: 750 },
  { code: 'LAS-001', description: 'Laser Skin Resurfacing - Full Face', price: 1500 },
  { code: 'LAS-002', description: 'IPL Photofacial', price: 400 },
  { code: 'LAS-003', description: 'Laser Hair Removal - Small Area', price: 150 },
  { code: 'LAS-004', description: 'Laser Hair Removal - Large Area', price: 350 },
  { code: 'CHM-001', description: 'Chemical Peel - Light', price: 150 },
  { code: 'CHM-002', description: 'Chemical Peel - Medium', price: 300 },
  { code: 'CHM-003', description: 'Chemical Peel - Deep', price: 500 },
  { code: 'MIC-001', description: 'Microneedling - Face', price: 350 },
  { code: 'MIC-002', description: 'Microneedling with PRP', price: 600 },
  { code: 'HYD-001', description: 'HydraFacial - Signature', price: 175 },
  { code: 'HYD-002', description: 'HydraFacial - Deluxe', price: 250 },
];

const MOCK_QUOTES: Quote[] = [
  {
    id: 'Q-2025-001',
    patientId: '1',
    createdAt: '2025-01-10',
    expiresAt: '2025-02-10',
    items: [
      { id: '1', code: 'BOT-002', description: 'Botox - Glabellar Lines (20 units)', quantity: 1, unitPrice: 280, total: 280 },
      { id: '2', code: 'BOT-003', description: 'Botox - Crow\'s Feet (24 units)', quantity: 1, unitPrice: 336, total: 336 },
    ],
    subtotal: 616,
    discount: 10,
    discountType: 'percent',
    total: 554.40,
    status: 'sent',
    notes: 'First-time cosmetic patient discount',
  },
  {
    id: 'Q-2025-002',
    patientId: '2',
    createdAt: '2025-01-08',
    expiresAt: '2025-02-08',
    items: [
      { id: '1', code: 'FIL-001', description: 'Juvederm Ultra XC (1 syringe)', quantity: 2, unitPrice: 650, total: 1300 },
      { id: '2', code: 'MIC-002', description: 'Microneedling with PRP', quantity: 3, unitPrice: 600, total: 1800 },
    ],
    subtotal: 3100,
    discount: 300,
    discountType: 'fixed',
    total: 2800,
    status: 'accepted',
  },
];

export function QuotesPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>(MOCK_QUOTES);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showNewQuoteModal, setShowNewQuoteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  const [newQuote, setNewQuote] = useState({
    patientId: '',
    items: [] as QuoteItem[],
    discount: 0,
    discountType: 'percent' as 'percent' | 'fixed',
    notes: '',
  });

  const [selectedProcedure, setSelectedProcedure] = useState('');
  const [procedureQty, setProcedureQty] = useState(1);

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const patientsRes = await fetchPatients(session.tenantId, session.accessToken);
      setPatients(patientsRes.patients || []);
    } catch (err: any) {
      showError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [session, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getPatientName = (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.lastName}, ${patient.firstName}` : 'Unknown';
  };

  const calculateQuoteTotal = (items: QuoteItem[], discount: number, discountType: 'percent' | 'fixed') => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = discountType === 'percent' ? subtotal * (discount / 100) : discount;
    return subtotal - discountAmount;
  };

  const handleAddProcedure = () => {
    if (!selectedProcedure) return;

    const procedure = COSMETIC_PROCEDURES.find((p) => p.code === selectedProcedure);
    if (!procedure) return;

    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      code: procedure.code,
      description: procedure.description,
      quantity: procedureQty,
      unitPrice: procedure.price,
      total: procedure.price * procedureQty,
    };

    setNewQuote((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));

    setSelectedProcedure('');
    setProcedureQty(1);
  };

  const handleRemoveItem = (itemId: string) => {
    setNewQuote((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  };

  const handleCreateQuote = () => {
    if (!newQuote.patientId) {
      showError('Please select a patient');
      return;
    }

    if (newQuote.items.length === 0) {
      showError('Please add at least one procedure');
      return;
    }

    const subtotal = newQuote.items.reduce((sum, item) => sum + item.total, 0);
    const total = calculateQuoteTotal(newQuote.items, newQuote.discount, newQuote.discountType);

    const quote: Quote = {
      id: `Q-2025-${String(quotes.length + 1).padStart(3, '0')}`,
      patientId: newQuote.patientId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      items: newQuote.items,
      subtotal,
      discount: newQuote.discount,
      discountType: newQuote.discountType,
      total,
      status: 'draft',
      notes: newQuote.notes,
    };

    setQuotes((prev) => [...prev, quote]);
    setShowNewQuoteModal(false);
    setNewQuote({
      patientId: '',
      items: [],
      discount: 0,
      discountType: 'percent',
      notes: '',
    });
    showSuccess('Quote created');
  };

  const handleSendQuote = (quote: Quote) => {
    setQuotes((prev) =>
      prev.map((q) => (q.id === quote.id ? { ...q, status: 'sent' as const } : q))
    );
    showSuccess('Quote sent to patient');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: QuoteStatus) => {
    switch (status) {
      case 'draft': return 'default';
      case 'sent': return 'info';
      case 'accepted': return 'success';
      case 'declined': return 'error';
      case 'expired': return 'warning';
      default: return 'default';
    }
  };

  const pendingQuotes = quotes.filter((q) => q.status === 'sent');
  const acceptedTotal = quotes
    .filter((q) => q.status === 'accepted')
    .reduce((sum, q) => sum + q.total, 0);

  if (loading) {
    return (
      <div className="quotes-page">
        <div className="page-header">
          <h1>Cosmetic Quotes</h1>
        </div>
        <Skeleton variant="card" height={100} />
        <Skeleton variant="card" height={400} />
      </div>
    );
  }

  return (
    <div className="quotes-page" style={{
      background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fcd34d 100%)',
      minHeight: '100vh',
      padding: '2rem'
    }}>
      <div className="page-header" style={{
        background: 'linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
        padding: '2rem',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(245, 158, 11, 0.3)',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>Cosmetic Quotes</h1>
          <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Manage cosmetic procedure quotes</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowNewQuoteModal(true)}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '10px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(245, 158, 11, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
          }}
        >
          + New Quote
        </button>
      </div>

      {/* Stats */}
      <div className="quote-stats" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="stat-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(245, 158, 11, 0.2)',
          border: '2px solid rgba(245, 158, 11, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(245, 158, 11, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{quotes.length}</div>
          <div className="stat-label" style={{
            color: '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Total Quotes</div>
        </div>
        <div className="stat-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(251, 191, 36, 0.2)',
          border: '2px solid rgba(251, 191, 36, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(251, 191, 36, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(251, 191, 36, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #fbbf24, #fcd34d)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{pendingQuotes.length}</div>
          <div className="stat-label" style={{
            color: '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Awaiting Response</div>
        </div>
        <div className="stat-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.9))',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(217, 119, 6, 0.2)',
          border: '2px solid rgba(217, 119, 6, 0.1)',
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(217, 119, 6, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(217, 119, 6, 0.2)';
        }}>
          <div className="stat-value" style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #d97706, #f59e0b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>{formatCurrency(acceptedTotal)}</div>
          <div className="stat-label" style={{
            color: '#6b7280',
            fontSize: '1rem',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>Accepted Value</div>
        </div>
      </div>

      {/* Quotes List */}
      <Panel title="">
        <div className="quotes-table">
          <table>
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Patient</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td className="strong">{quote.id}</td>
                  <td>{getPatientName(quote.patientId)}</td>
                  <td className="muted">{new Date(quote.createdAt).toLocaleDateString()}</td>
                  <td className="muted">{new Date(quote.expiresAt).toLocaleDateString()}</td>
                  <td>{quote.items.length} procedures</td>
                  <td className="strong">{formatCurrency(quote.total)}</td>
                  <td>
                    <span className={`pill ${getStatusColor(quote.status)}`}>{quote.status}</span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="btn-sm btn-secondary"
                        onClick={() => {
                          setSelectedQuote(quote);
                          setShowViewModal(true);
                        }}
                      >
                        View
                      </button>
                      {quote.status === 'draft' && (
                        <button
                          type="button"
                          className="btn-sm btn-primary"
                          onClick={() => handleSendQuote(quote)}
                        >
                          Send
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* New Quote Modal */}
      <Modal
        isOpen={showNewQuoteModal}
        title="Create Cosmetic Quote"
        onClose={() => setShowNewQuoteModal(false)}
        size="lg"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Patient *</label>
            <select
              value={newQuote.patientId}
              onChange={(e) => setNewQuote((prev) => ({ ...prev, patientId: e.target.value }))}
            >
              <option value="">Select patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <h4>Add Procedures</h4>
            <div className="add-procedure-row">
              <select
                value={selectedProcedure}
                onChange={(e) => setSelectedProcedure(e.target.value)}
                className="procedure-select"
              >
                <option value="">Select procedure...</option>
                {COSMETIC_PROCEDURES.map((proc) => (
                  <option key={proc.code} value={proc.code}>
                    {proc.description} - {formatCurrency(proc.price)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={procedureQty}
                onChange={(e) => setProcedureQty(parseInt(e.target.value) || 1)}
                className="qty-input"
                style={{ width: '80px' }}
              />
              <button type="button" className="btn-secondary" onClick={handleAddProcedure}>
                Add
              </button>
            </div>
          </div>

          {newQuote.items.length > 0 && (
            <div className="quote-items">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Procedure</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {newQuote.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>{formatCurrency(item.unitPrice)}</td>
                      <td>{formatCurrency(item.total)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          X
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="quote-totals">
                <div className="total-row">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(newQuote.items.reduce((sum, item) => sum + item.total, 0))}</span>
                </div>
                <div className="discount-row">
                  <span>Discount:</span>
                  <div className="discount-input">
                    <input
                      type="number"
                      min="0"
                      value={newQuote.discount}
                      onChange={(e) => setNewQuote((prev) => ({ ...prev, discount: parseFloat(e.target.value) || 0 }))}
                      style={{ width: '80px' }}
                    />
                    <select
                      value={newQuote.discountType}
                      onChange={(e) => setNewQuote((prev) => ({ ...prev, discountType: e.target.value as 'percent' | 'fixed' }))}
                    >
                      <option value="percent">%</option>
                      <option value="fixed">$</option>
                    </select>
                  </div>
                </div>
                <div className="total-row grand">
                  <span>Total:</span>
                  <span>{formatCurrency(calculateQuoteTotal(newQuote.items, newQuote.discount, newQuote.discountType))}</span>
                </div>
              </div>
            </div>
          )}

          <div className="form-field">
            <label>Notes</label>
            <textarea
              value={newQuote.notes}
              onChange={(e) => setNewQuote((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes for the patient..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowNewQuoteModal(false)}
          >
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleCreateQuote}>
            Create Quote
          </button>
        </div>
      </Modal>

      {/* View Quote Modal */}
      <Modal
        isOpen={showViewModal}
        title={`Quote ${selectedQuote?.id}`}
        onClose={() => {
          setShowViewModal(false);
          setSelectedQuote(null);
        }}
        size="lg"
      >
        {selectedQuote && (
          <div className="quote-detail">
            <div className="quote-header-info">
              <div className="info-row">
                <span className="label">Patient:</span>
                <span className="value">{getPatientName(selectedQuote.patientId)}</span>
              </div>
              <div className="info-row">
                <span className="label">Created:</span>
                <span className="value">{new Date(selectedQuote.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="info-row">
                <span className="label">Expires:</span>
                <span className="value">{new Date(selectedQuote.expiresAt).toLocaleDateString()}</span>
              </div>
              <div className="info-row">
                <span className="label">Status:</span>
                <span className={`pill ${getStatusColor(selectedQuote.status)}`}>{selectedQuote.status}</span>
              </div>
            </div>

            <table className="items-table">
              <thead>
                <tr>
                  <th>Procedure</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuote.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                    <td>{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="quote-totals">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>{formatCurrency(selectedQuote.subtotal)}</span>
              </div>
              {selectedQuote.discount > 0 && (
                <div className="total-row discount">
                  <span>Discount ({selectedQuote.discountType === 'percent' ? `${selectedQuote.discount}%` : formatCurrency(selectedQuote.discount)}):</span>
                  <span>-{formatCurrency(selectedQuote.discountType === 'percent' ? selectedQuote.subtotal * (selectedQuote.discount / 100) : selectedQuote.discount)}</span>
                </div>
              )}
              <div className="total-row grand">
                <span>Total:</span>
                <span>{formatCurrency(selectedQuote.total)}</span>
              </div>
            </div>

            {selectedQuote.notes && (
              <div className="quote-notes">
                <h4>Notes</h4>
                <p>{selectedQuote.notes}</p>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowViewModal(false)}
          >
            Close
          </button>
          {selectedQuote?.status === 'draft' && (
            <>
              <button type="button" className="btn-secondary">Edit</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (selectedQuote) {
                    handleSendQuote(selectedQuote);
                    setShowViewModal(false);
                  }
                }}
              >
                Send to Patient
              </button>
            </>
          )}
          {selectedQuote?.status === 'accepted' && (
            <button type="button" className="btn-primary">Convert to Invoice</button>
          )}
        </div>
      </Modal>
    </div>
  );
}
