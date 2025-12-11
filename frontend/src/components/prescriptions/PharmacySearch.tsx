import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Modal } from '../ui';
import { API_BASE_URL, TENANT_HEADER_NAME } from '../../api';

export interface Pharmacy {
  id: string;
  ncpdpId?: string;
  name: string;
  phone?: string;
  fax?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  isPreferred: boolean;
  is24Hour: boolean;
  acceptsErx: boolean;
}

interface PharmacySearchProps {
  onSelect: (pharmacy: Pharmacy) => void;
  selectedPharmacy?: Pharmacy;
}

export function PharmacySearch({ onSelect, selectedPharmacy }: PharmacySearchProps) {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newPharmacy, setNewPharmacy] = useState({
    name: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    isPreferred: false,
  });

  const loadPharmacies = async (search?: string) => {
    if (!session) return;

    setLoading(true);
    try {
      const url = search
        ? `${API_BASE_URL}/api/pharmacies?search=${encodeURIComponent(search)}`
        : `${API_BASE_URL}/api/pharmacies?preferred=true`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
      });

      if (!res.ok) throw new Error('Failed to load pharmacies');

      const data = await res.json();
      setPharmacies(data.pharmacies || []);
    } catch (error) {
      console.error('Error loading pharmacies:', error);
      showError('Failed to load pharmacies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showModal) {
      loadPharmacies();
    }
  }, [showModal]);

  useEffect(() => {
    if (!searchTerm) {
      loadPharmacies();
      return;
    }

    const timer = setTimeout(() => {
      loadPharmacies(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleAddPharmacy = async () => {
    if (!session || !newPharmacy.name) {
      showError('Pharmacy name is required');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/pharmacies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          [TENANT_HEADER_NAME]: session.tenantId,
        },
        body: JSON.stringify(newPharmacy),
      });

      if (!res.ok) throw new Error('Failed to add pharmacy');

      showSuccess('Pharmacy added successfully');
      setShowAddModal(false);
      setNewPharmacy({
        name: '',
        phone: '',
        street: '',
        city: '',
        state: '',
        zip: '',
        isPreferred: false,
      });
      loadPharmacies();
    } catch (error) {
      console.error('Error adding pharmacy:', error);
      showError('Failed to add pharmacy');
    }
  };

  return (
    <>
      <div>
        <div
          onClick={() => setShowModal(true)}
          style={{
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            background: '#ffffff',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {selectedPharmacy ? (
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{selectedPharmacy.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {selectedPharmacy.street && `${selectedPharmacy.street}, `}
                {selectedPharmacy.city && `${selectedPharmacy.city}, `}
                {selectedPharmacy.state} {selectedPharmacy.zip}
              </div>
              {selectedPharmacy.phone && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Phone: {selectedPharmacy.phone}
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: '#9ca3af' }}>Select pharmacy...</span>
          )}
          <span style={{ color: '#6b7280' }}>▼</span>
        </div>
      </div>

      <Modal isOpen={showModal} title="Select Pharmacy" onClose={() => setShowModal(false)} size="lg">
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, city, or zip..."
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
              }}
            />
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '0.5rem 1rem',
                background: '#0369a1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              + Add New
            </button>
          </div>

          <div
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
            }}
          >
            {loading && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                Loading pharmacies...
              </div>
            )}

            {!loading && pharmacies.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                No pharmacies found. Click "Add New" to add a pharmacy.
              </div>
            )}

            {!loading &&
              pharmacies.map((pharmacy) => (
                <div
                  key={pharmacy.id}
                  onClick={() => {
                    onSelect(pharmacy);
                    setShowModal(false);
                  }}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    background:
                      selectedPharmacy?.id === pharmacy.id ? '#eff6ff' : '#ffffff',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPharmacy?.id !== pharmacy.id) {
                      e.currentTarget.style.background = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPharmacy?.id !== pharmacy.id) {
                      e.currentTarget.style.background = '#ffffff';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: '0.875rem',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        {pharmacy.name}
                        {pharmacy.isPreferred && (
                          <span
                            style={{
                              background: '#10b981',
                              color: '#ffffff',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.625rem',
                              fontWeight: 600,
                            }}
                          >
                            PREFERRED
                          </span>
                        )}
                        {pharmacy.is24Hour && (
                          <span
                            style={{
                              background: '#6366f1',
                              color: '#ffffff',
                              padding: '0.125rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.625rem',
                              fontWeight: 600,
                            }}
                          >
                            24HR
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {pharmacy.street && <div>{pharmacy.street}</div>}
                        {(pharmacy.city || pharmacy.state || pharmacy.zip) && (
                          <div>
                            {pharmacy.city}
                            {pharmacy.city && pharmacy.state && ', '}
                            {pharmacy.state} {pharmacy.zip}
                          </div>
                        )}
                        {pharmacy.phone && <div>Phone: {pharmacy.phone}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
            Close
          </button>
        </div>
      </Modal>

      {/* Add Pharmacy Modal */}
      <Modal
        isOpen={showAddModal}
        title="Add New Pharmacy"
        onClose={() => setShowAddModal(false)}
        size="md"
      >
        <div className="modal-form">
          <div className="form-field">
            <label>Pharmacy Name *</label>
            <input
              type="text"
              value={newPharmacy.name}
              onChange={(e) => setNewPharmacy({ ...newPharmacy, name: e.target.value })}
              placeholder="CVS Pharmacy"
            />
          </div>
          <div className="form-field">
            <label>Phone</label>
            <input
              type="tel"
              value={newPharmacy.phone}
              onChange={(e) => setNewPharmacy({ ...newPharmacy, phone: e.target.value })}
              placeholder="(555) 555-5555"
            />
          </div>
          <div className="form-field">
            <label>Street Address</label>
            <input
              type="text"
              value={newPharmacy.street}
              onChange={(e) => setNewPharmacy({ ...newPharmacy, street: e.target.value })}
              placeholder="123 Main St"
            />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>City</label>
              <input
                type="text"
                value={newPharmacy.city}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, city: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>State</label>
              <input
                type="text"
                value={newPharmacy.state}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, state: e.target.value })}
                maxLength={2}
                placeholder="FL"
              />
            </div>
            <div className="form-field">
              <label>ZIP</label>
              <input
                type="text"
                value={newPharmacy.zip}
                onChange={(e) => setNewPharmacy({ ...newPharmacy, zip: e.target.value })}
                placeholder="33301"
              />
            </div>
          </div>
          <div className="form-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={newPharmacy.isPreferred}
                onChange={(e) =>
                  setNewPharmacy({ ...newPharmacy, isPreferred: e.target.checked })
                }
              />
              Mark as preferred pharmacy
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleAddPharmacy}>
            Add Pharmacy
          </button>
        </div>
      </Modal>
    </>
  );
}
