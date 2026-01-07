/**
 * Pharmacy Search Modal
 *
 * Modal dialog for searching and selecting pharmacies.
 * Supports search by name, location, and proximity.
 */

import { useState, useEffect } from 'react';
import { X, Search, MapPin, Clock, Phone, Star } from 'lucide-react';
import { searchPharmacies, getPreferredPharmacies } from '../api-erx';
import { useAuth } from '../contexts/AuthContext';

interface Pharmacy {
  id: string;
  ncpdp_id: string;
  name: string;
  chain?: string;
  phone?: string;
  fax?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  is_preferred: boolean;
  is_24_hour: boolean;
  distance?: number;
  hours?: any;
}

interface PharmacySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (pharmacy: Pharmacy) => void;
  patientLocation?: {
    city?: string;
    state?: string;
    zip?: string;
  };
}

export function PharmacySearchModal({
  isOpen,
  onClose,
  onSelect,
  patientLocation,
}: PharmacySearchModalProps) {
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCity, setSearchCity] = useState(patientLocation?.city || '');
  const [searchState, setSearchState] = useState(patientLocation?.state || '');
  const [searchZip, setSearchZip] = useState(patientLocation?.zip || '');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'preferred'>('preferred');

  useEffect(() => {
    if (isOpen && activeTab === 'preferred') {
      loadPreferredPharmacies();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (patientLocation) {
      setSearchCity(patientLocation.city || '');
      setSearchState(patientLocation.state || '');
      setSearchZip(patientLocation.zip || '');
    }
  }, [patientLocation]);

  const loadPreferredPharmacies = async () => {
    if (!session?.tenantId || !session?.accessToken) return;

    setIsLoading(true);
    try {
      const data = await getPreferredPharmacies(session.tenantId, session.accessToken);
      setPharmacies(data.pharmacies);
    } catch (error) {
      console.error('Error loading preferred pharmacies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!session?.tenantId || !session?.accessToken) return;

    if (!searchQuery && !searchCity && !searchState && !searchZip) {
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchPharmacies(
        session.tenantId,
        session.accessToken,
        {
          q: searchQuery || undefined,
          city: searchCity || undefined,
          state: searchState || undefined,
          zip: searchZip || undefined,
        }
      );
      setPharmacies(data.pharmacies);
    } catch (error) {
      console.error('Error searching pharmacies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPharmacy = (pharmacy: Pharmacy) => {
    onSelect(pharmacy);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
            Select Pharmacy
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} style={{ color: '#6b7280' }} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e5e7eb',
            padding: '0 24px',
          }}
        >
          <button
            onClick={() => setActiveTab('preferred')}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'preferred' ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: activeTab === 'preferred' ? '#3b82f6' : '#6b7280',
            }}
          >
            Preferred
          </button>
          <button
            onClick={() => setActiveTab('search')}
            style={{
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'search' ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: activeTab === 'search' ? '#3b82f6' : '#6b7280',
            }}
          >
            Search
          </button>
        </div>

        {/* Search Form */}
        {activeTab === 'search' && (
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                  }}
                >
                  Name or Chain
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="CVS, Walgreens, etc."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '6px',
                  }}
                >
                  City
                </label>
                <input
                  type="text"
                  value={searchCity}
                  onChange={e => setSearchCity(e.target.value)}
                  placeholder="City"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    State
                  </label>
                  <input
                    type="text"
                    value={searchState}
                    onChange={e => setSearchState(e.target.value.toUpperCase())}
                    placeholder="CA"
                    maxLength={2}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px',
                    }}
                  >
                    ZIP
                  </label>
                  <input
                    type="text"
                    value={searchZip}
                    onChange={e => setSearchZip(e.target.value)}
                    placeholder="12345"
                    maxLength={10}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={isLoading}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Search size={16} />
              Search
            </button>
          </div>
        )}

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              Loading pharmacies...
            </div>
          ) : pharmacies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              {activeTab === 'search'
                ? 'No pharmacies found. Try different search criteria.'
                : 'No preferred pharmacies configured.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pharmacies.map(pharmacy => (
                <div
                  key={pharmacy.id}
                  onClick={() => handleSelectPharmacy(pharmacy)}
                  style={{
                    padding: '16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: '#111827',
                          }}
                        >
                          {pharmacy.name}
                        </h3>
                        {pharmacy.is_preferred && (
                          <Star
                            size={14}
                            style={{ color: '#f59e0b', fill: '#f59e0b' }}
                          />
                        )}
                        {pharmacy.is_24_hour && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '4px',
                              fontWeight: 500,
                            }}
                          >
                            24hr
                          </span>
                        )}
                      </div>

                      <div style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={14} />
                          {pharmacy.street && <span>{pharmacy.street}, </span>}
                          {pharmacy.city && <span>{pharmacy.city}, </span>}
                          {pharmacy.state && <span>{pharmacy.state} </span>}
                          {pharmacy.zip && <span>{pharmacy.zip}</span>}
                        </div>

                        {pharmacy.phone && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginTop: '4px',
                            }}
                          >
                            <Phone size={14} />
                            {pharmacy.phone}
                          </div>
                        )}

                        {pharmacy.distance !== undefined && (
                          <div
                            style={{
                              marginTop: '4px',
                              fontSize: '12px',
                              color: '#059669',
                              fontWeight: 500,
                            }}
                          >
                            {pharmacy.distance.toFixed(1)} miles away
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        backgroundColor: '#f9fafb',
                        color: '#6b7280',
                        borderRadius: '4px',
                      }}
                    >
                      NCPDP: {pharmacy.ncpdp_id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
