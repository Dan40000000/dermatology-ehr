import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Panel, Skeleton } from '../components/ui';
import {
  PackageCard,
  PackagePurchase,
  MembershipPlans,
  LoyaltyWidget,
  PatientPackages,
  ServiceRedemption,
  type CosmeticPackage,
  type MembershipPlan,
  type LoyaltyPoints,
  type LoyaltyTransaction,
  type PatientPackage,
  type PurchaseData,
  type RedemptionData,
} from '../components/cosmetic';
import { API_BASE_URL } from '../utils/apiBase';

interface CosmeticService {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  basePriceCents: number;
  unitType: string;
  loyaltyPointsPerDollar: number;
  isActive: boolean;
}

type TabType = 'services' | 'packages' | 'memberships' | 'my-packages' | 'loyalty';

export function CosmeticServicesPage() {
  const { session } = useAuth();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('packages');
  const [loading, setLoading] = useState(true);
  const [selectedPatientId] = useState<string | null>(null);

  // Data states
  const [services, setServices] = useState<CosmeticService[]>([]);
  const [packages, setPackages] = useState<CosmeticPackage[]>([]);
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [patientPackages, setPatientPackages] = useState<PatientPackage[]>([]);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyPoints | null>(null);
  const [loyaltyTransactions, setLoyaltyTransactions] = useState<LoyaltyTransaction[]>([]);

  // UI states
  const [purchasePackage, setPurchasePackage] = useState<CosmeticPackage | null>(null);
  const [redeemingService, setRedeemingService] = useState<{
    pkg: PatientPackage;
    serviceId: string;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Demo patient for testing
  const demoPatientId = 'patient-demo-001';

  const loadServices = useCallback(async () => {
    if (!session) return;

    try {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/cosmetic/services?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load services');
      const data = await response.json();
      setServices(data.services || []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load services');
    }
  }, [session, categoryFilter, searchQuery, showError]);

  const loadPackages = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/cosmetic/packages`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to load packages');
      const data = await response.json();
      setPackages(data.packages || []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load packages');
    }
  }, [session, showError]);

  const loadMembershipPlans = useCallback(async () => {
    if (!session) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/cosmetic/memberships/plans`, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to load membership plans');
      const data = await response.json();
      setMembershipPlans(data.plans || []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load membership plans');
    }
  }, [session, showError]);

  const loadPatientPackages = useCallback(async (patientId: string) => {
    if (!session) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/cosmetic/patient/${patientId}/packages?includeExpired=true`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load patient packages');
      const data = await response.json();
      setPatientPackages(data.packages || []);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load patient packages');
    }
  }, [session, showError]);

  const loadLoyaltyData = useCallback(async (patientId: string) => {
    if (!session) return;

    try {
      const [loyaltyRes, transactionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cosmetic/patient/${patientId}/loyalty`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }),
        fetch(`${API_BASE_URL}/api/cosmetic/patient/${patientId}/loyalty/transactions?limit=10`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'x-tenant-id': session.tenantId,
          },
        }),
      ]);

      if (loyaltyRes.ok) {
        const loyaltyData = await loyaltyRes.json();
        setLoyaltyData(loyaltyData);
      }

      if (transactionsRes.ok) {
        const transactionsData = await transactionsRes.json();
        setLoyaltyTransactions(transactionsData.transactions || []);
      }
    } catch (err: unknown) {
      console.error('Error loading loyalty data:', err);
    }
  }, [session]);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadServices(),
        loadPackages(),
        loadMembershipPlans(),
        loadPatientPackages(selectedPatientId || demoPatientId),
        loadLoyaltyData(selectedPatientId || demoPatientId),
      ]);
    } finally {
      setLoading(false);
    }
  }, [loadServices, loadPackages, loadMembershipPlans, loadPatientPackages, loadLoyaltyData, selectedPatientId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handlePurchasePackage = async (data: PurchaseData) => {
    if (!session) return;

    const response = await fetch(`${API_BASE_URL}/api/cosmetic/packages/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        'x-tenant-id': session.tenantId,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to purchase package');
    }

    showSuccess('Package purchased successfully!');
    setPurchasePackage(null);
    await loadPatientPackages(data.patientId);
    await loadLoyaltyData(data.patientId);
  };

  const handleRedeemService = async (data: RedemptionData) => {
    if (!session) return;

    const response = await fetch(
      `${API_BASE_URL}/api/cosmetic/packages/${data.patientPackageId}/redeem`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        },
        body: JSON.stringify({
          serviceId: data.serviceId,
          quantity: data.quantity,
          encounterId: data.encounterId,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to redeem service');
    }

    showSuccess('Service redeemed successfully!');
    setRedeemingService(null);
    await loadPatientPackages(selectedPatientId || demoPatientId);
  };

  const handleEnrollMembership = async (planId: string, billingFrequency: 'monthly' | 'annual') => {
    if (!session) return;

    const patientId = selectedPatientId || demoPatientId;

    const response = await fetch(`${API_BASE_URL}/api/cosmetic/memberships/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
        'x-tenant-id': session.tenantId,
      },
      body: JSON.stringify({
        patientId,
        planId,
        billingFrequency,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to enroll in membership');
    }

    showSuccess('Membership enrolled successfully!');
    await loadLoyaltyData(patientId);
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const categories = Array.from(new Set(services.map(s => s.category)));

  const styles: Record<string, CSSProperties> = {
    page: {
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto',
    },
    header: {
      marginBottom: '24px',
    },
    title: {
      fontSize: '32px',
      fontWeight: '800',
      color: '#111827',
      margin: '0 0 8px 0',
    },
    subtitle: {
      fontSize: '16px',
      color: '#6b7280',
      margin: 0,
    },
    tabs: {
      display: 'flex',
      gap: '4px',
      marginBottom: '24px',
      background: '#f3f4f6',
      padding: '4px',
      borderRadius: '12px',
      overflowX: 'auto',
    },
    tab: {
      padding: '12px 24px',
      border: 'none',
      background: 'transparent',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#6b7280',
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
      transition: 'all 0.2s',
    },
    tabActive: {
      background: 'white',
      color: '#111827',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    content: {
      minHeight: '400px',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
      gap: '24px',
    },
    sidebar: {
      position: 'sticky' as const,
      top: '24px',
    },
    filterSection: {
      marginBottom: '24px',
    },
    filterRow: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap' as const,
      marginBottom: '16px',
    },
    searchInput: {
      flex: '1',
      minWidth: '200px',
      padding: '10px 16px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      fontSize: '14px',
    },
    filterChip: {
      padding: '8px 16px',
      border: '2px solid #e5e7eb',
      background: 'white',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    filterChipActive: {
      background: '#059669',
      borderColor: '#059669',
      color: 'white',
    },
    servicesGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '16px',
    },
    serviceCard: {
      background: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: '20px',
      transition: 'all 0.2s',
    },
    serviceName: {
      fontSize: '16px',
      fontWeight: '700',
      color: '#111827',
      margin: '0 0 8px 0',
    },
    serviceCategory: {
      display: 'inline-block',
      padding: '4px 10px',
      background: '#e0e7ff',
      color: '#4f46e5',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase' as const,
      marginBottom: '12px',
    },
    serviceDescription: {
      fontSize: '14px',
      color: '#6b7280',
      marginBottom: '16px',
      lineHeight: 1.5,
    },
    serviceFooter: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    servicePrice: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#059669',
    },
    serviceUnit: {
      fontSize: '12px',
      color: '#6b7280',
    },
    loyaltyBadge: {
      fontSize: '12px',
      color: '#f59e0b',
      fontWeight: '600',
    },
    twoColumn: {
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: '24px',
    },
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>Cosmetic Services</h1>
        </div>
        <Skeleton variant="card" height={600} />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Cosmetic Services & Packages</h1>
        <p style={styles.subtitle}>
          Explore our aesthetic services, packages, and membership benefits
        </p>
      </div>

      <div style={styles.tabs}>
        {[
          { id: 'packages', label: 'Packages' },
          { id: 'services', label: 'Services Menu' },
          { id: 'memberships', label: 'Memberships' },
          { id: 'my-packages', label: 'My Packages' },
          { id: 'loyalty', label: 'Loyalty Rewards' },
        ].map((tab) => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.id as TabType)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* Packages Tab */}
        {activeTab === 'packages' && (
          <div style={styles.grid}>
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onPurchase={() => setPurchasePackage(pkg)}
              />
            ))}
            {packages.length === 0 && (
              <Panel title="">
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  No packages available at this time.
                </div>
              </Panel>
            )}
          </div>
        )}

        {/* Services Tab */}
        {activeTab === 'services' && (
          <div>
            <div style={styles.filterSection}>
              <div style={styles.filterRow}>
                <input
                  type="text"
                  placeholder="Search services..."
                  style={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div style={styles.filterRow}>
                <button
                  style={{
                    ...styles.filterChip,
                    ...(categoryFilter === 'all' ? styles.filterChipActive : {}),
                  }}
                  onClick={() => setCategoryFilter('all')}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    style={{
                      ...styles.filterChip,
                      ...(categoryFilter === cat ? styles.filterChipActive : {}),
                    }}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.servicesGrid}>
              {services.map((svc) => (
                <div key={svc.id} style={styles.serviceCard}>
                  <span style={styles.serviceCategory}>
                    {svc.category.replace(/_/g, ' ')}
                  </span>
                  <h3 style={styles.serviceName}>{svc.name}</h3>
                  {svc.description && (
                    <p style={styles.serviceDescription}>{svc.description}</p>
                  )}
                  <div style={styles.serviceFooter}>
                    <div>
                      <div style={styles.servicePrice}>
                        {formatCurrency(svc.basePriceCents)}
                      </div>
                      <div style={styles.serviceUnit}>
                        per {svc.unitType}
                      </div>
                    </div>
                    {svc.loyaltyPointsPerDollar > 0 && (
                      <div style={styles.loyaltyBadge}>
                        Earn {svc.loyaltyPointsPerDollar}x points
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Memberships Tab */}
        {activeTab === 'memberships' && (
          <MembershipPlans
            plans={membershipPlans}
            onEnroll={handleEnrollMembership}
          />
        )}

        {/* My Packages Tab */}
        {activeTab === 'my-packages' && (
          <div style={styles.twoColumn}>
            <div>
              <Panel title="My Purchased Packages">
                <PatientPackages
                  packages={patientPackages}
                  onRedeem={(pkgId, serviceId) => {
                    const pkg = patientPackages.find(p => p.id === pkgId);
                    if (pkg) {
                      setRedeemingService({ pkg, serviceId });
                    }
                  }}
                />
              </Panel>
            </div>
            <div style={styles.sidebar}>
              {loyaltyData && (
                <LoyaltyWidget
                  loyalty={loyaltyData}
                  recentTransactions={loyaltyTransactions}
                  compact
                />
              )}
            </div>
          </div>
        )}

        {/* Loyalty Tab */}
        {activeTab === 'loyalty' && loyaltyData && (
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <LoyaltyWidget
              loyalty={loyaltyData}
              recentTransactions={loyaltyTransactions}
            />
          </div>
        )}
      </div>

      {/* Purchase Modal */}
      {purchasePackage && (
        <PackagePurchase
          pkg={purchasePackage}
          patientId={selectedPatientId || demoPatientId}
          patientName="Demo Patient"
          onPurchase={handlePurchasePackage}
          onClose={() => setPurchasePackage(null)}
        />
      )}

      {/* Redemption Modal */}
      {redeemingService && (
        <ServiceRedemption
          patientPackage={redeemingService.pkg}
          serviceId={redeemingService.serviceId}
          service={redeemingService.pkg.remainingServices[redeemingService.serviceId]}
          onRedeem={handleRedeemService}
          onClose={() => setRedeemingService(null)}
        />
      )}
    </div>
  );
}
