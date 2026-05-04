import { useEffect, useMemo, useState } from 'react';
import { searchPortalPharmacies, type PortalPharmacy } from '../../portalApi';
import { formatPhoneDisplay } from '../../utils/phone';

export interface PortalPharmacySelection {
  pharmacyId: string | null;
  pharmacyNcpdp: string | null;
  pharmacyName: string;
  pharmacyPhone: string;
  pharmacyAddress: string;
}

export function formatPortalPharmacyAddress(pharmacy: Partial<PortalPharmacy>): string {
  return [
    pharmacy.street,
    [pharmacy.city, pharmacy.state, pharmacy.zip].filter(Boolean).join(', ').replace(', ,', ','),
  ].filter(Boolean).join(', ');
}

export function toPortalPharmacySelection(pharmacy: PortalPharmacy): PortalPharmacySelection {
  return {
    pharmacyId: pharmacy.id,
    pharmacyNcpdp: pharmacy.ncpdpId || null,
    pharmacyName: pharmacy.name,
    pharmacyPhone: pharmacy.phone || '',
    pharmacyAddress: formatPortalPharmacyAddress(pharmacy),
  };
}

export function PortalPharmacyLookup({
  tenantId,
  portalToken,
  selected,
  onSelect,
}: {
  tenantId: string;
  portalToken: string;
  selected?: Partial<PortalPharmacySelection>;
  onSelect: (selection: PortalPharmacySelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [pharmacies, setPharmacies] = useState<PortalPharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSummary = useMemo(() => {
    if (!selected?.pharmacyName) return null;
    return [
      selected.pharmacyName,
      selected.pharmacyAddress,
      selected.pharmacyPhone ? formatPhoneDisplay(selected.pharmacyPhone) : '',
      selected.pharmacyNcpdp ? `NCPDP ${selected.pharmacyNcpdp}` : '',
    ].filter(Boolean).join(' • ');
  }, [selected]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await searchPortalPharmacies(tenantId, portalToken, {
          query: query.trim() || undefined,
          preferred: !query.trim(),
        });
        setPharmacies(data.pharmacies || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to search pharmacies');
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 250 : 0);

    return () => window.clearTimeout(timer);
  }, [query, tenantId, portalToken]);

  return (
    <div className="portal-pharmacy-lookup">
      {selectedSummary && (
        <div className="portal-pharmacy-selected">
          <span className="portal-pharmacy-selected-label">Selected pharmacy</span>
          <span>{selectedSummary}</span>
        </div>
      )}

      <input
        type="text"
        className="form-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search pharmacy by name, city, ZIP, or NCPDP"
      />

      <div className="portal-pharmacy-results">
        {loading && <div className="portal-pharmacy-status">Searching pharmacies...</div>}
        {error && <div className="portal-pharmacy-error">{error}</div>}
        {!loading && !error && pharmacies.length === 0 && (
          <div className="portal-pharmacy-status">No pharmacy matches found.</div>
        )}
        {!loading && !error && pharmacies.map((pharmacy) => (
          <button
            type="button"
            key={pharmacy.id}
            className="portal-pharmacy-result"
            onClick={() => onSelect(toPortalPharmacySelection(pharmacy))}
          >
            <span className="portal-pharmacy-result-main">
              <strong>{pharmacy.name}</strong>
              {pharmacy.isPreferred && <em>Preferred</em>}
              {pharmacy.is24Hour && <em>24 hour</em>}
            </span>
            <span className="portal-pharmacy-result-detail">
              {formatPortalPharmacyAddress(pharmacy) || 'Address not listed'}
            </span>
            <span className="portal-pharmacy-result-detail">
              {[pharmacy.phone ? formatPhoneDisplay(pharmacy.phone) : '', pharmacy.ncpdpId ? `NCPDP ${pharmacy.ncpdpId}` : ''].filter(Boolean).join(' • ')}
            </span>
          </button>
        ))}
      </div>

      <style>{`
        .portal-pharmacy-lookup {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .portal-pharmacy-lookup .form-input {
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          box-sizing: border-box;
          color: #0f172a;
          font: inherit;
          padding: 0.7rem 0.85rem;
          width: 100%;
        }

        .portal-pharmacy-selected {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          color: #166534;
          display: flex;
          flex-direction: column;
          font-size: 0.82rem;
          gap: 0.2rem;
          padding: 0.75rem;
        }

        .portal-pharmacy-selected-label {
          color: #15803d;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .portal-pharmacy-results {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          max-height: 260px;
          overflow-y: auto;
        }

        .portal-pharmacy-result {
          background: #fff;
          border: 0;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.8rem 0.9rem;
          text-align: left;
          width: 100%;
        }

        .portal-pharmacy-result:hover {
          background: #f8fafc;
        }

        .portal-pharmacy-result-main {
          align-items: center;
          color: #0f172a;
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          font-size: 0.9rem;
        }

        .portal-pharmacy-result-main em {
          background: #e0f2fe;
          border-radius: 999px;
          color: #0369a1;
          font-size: 0.67rem;
          font-style: normal;
          font-weight: 700;
          padding: 0.15rem 0.45rem;
          text-transform: uppercase;
        }

        .portal-pharmacy-result-detail,
        .portal-pharmacy-status,
        .portal-pharmacy-error {
          color: #64748b;
          font-size: 0.78rem;
        }

        .portal-pharmacy-status,
        .portal-pharmacy-error {
          padding: 0.9rem;
        }

        .portal-pharmacy-error {
          color: #b91c1c;
        }
      `}</style>
    </div>
  );
}
