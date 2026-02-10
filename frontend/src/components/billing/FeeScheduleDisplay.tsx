import { useState, useEffect } from 'react';
import { getSuperbillFee } from '../../api';
import type { SuperbillLineItem } from '../../types/superbill';

interface FeeScheduleDisplayProps {
  lineItems: SuperbillLineItem[];
  tenantId: string;
  accessToken: string;
  payerId?: string;
}

interface FeeInfo {
  cptCode: string;
  scheduleFee: number;
  currentFee: number;
  difference: number;
}

export function FeeScheduleDisplay({
  lineItems,
  tenantId,
  accessToken,
  payerId,
}: FeeScheduleDisplayProps) {
  const [feeComparison, setFeeComparison] = useState<FeeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const loadFees = async () => {
      if (lineItems.length === 0) {
        setFeeComparison([]);
        return;
      }

      try {
        setLoading(true);
        const uniqueCodes = [...new Set(lineItems.map(item => item.cptCode))];
        const feeResults = await Promise.all(
          uniqueCodes.map(async (code) => {
            try {
              const result = await getSuperbillFee(tenantId, accessToken, code, payerId);
              return { code, fee: result.fee };
            } catch {
              return { code, fee: 0 };
            }
          })
        );

        const feeMap = new Map(feeResults.map(r => [r.code, r.fee]));

        const comparison: FeeInfo[] = lineItems.map(item => ({
          cptCode: item.cptCode,
          scheduleFee: feeMap.get(item.cptCode) || 0,
          currentFee: item.fee,
          difference: item.fee - (feeMap.get(item.cptCode) || 0),
        }));

        setFeeComparison(comparison);
      } catch (err) {
        console.error('Failed to load fee schedule:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFees();
  }, [lineItems, tenantId, accessToken, payerId]);

  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const hasDiscrepancies = feeComparison.some(f => f.difference !== 0);
  const totalScheduleFee = feeComparison.reduce((sum, f) => sum + f.scheduleFee, 0);
  const totalCurrentFee = feeComparison.reduce((sum, f) => sum + f.currentFee, 0);
  const totalDifference = totalCurrentFee - totalScheduleFee;

  if (lineItems.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#6b7280',
        }}
      >
        <span style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>
          {'>'}
        </span>
        Fee Schedule Comparison
        {hasDiscrepancies && (
          <span style={{
            padding: '0.125rem 0.5rem',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '9999px',
            fontSize: '0.625rem',
            fontWeight: 600,
          }}>
            {totalDifference > 0 ? '+' : ''}{formatCurrency(totalDifference)} vs schedule
          </span>
        )}
      </button>

      {expanded && (
        <div style={{
          marginTop: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
              Loading fee schedule...
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 100px 100px 100px',
                padding: '0.75rem 1rem',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
              }}>
                <div>CPT</div>
                <div>Description</div>
                <div style={{ textAlign: 'right' }}>Schedule Fee</div>
                <div style={{ textAlign: 'right' }}>Current Fee</div>
                <div style={{ textAlign: 'right' }}>Difference</div>
              </div>

              {/* Rows */}
              {lineItems.map((item, index) => {
                const comparison = feeComparison.find(f => f.cptCode === item.cptCode);
                const difference = comparison?.difference || 0;

                return (
                  <div
                    key={item.id || index}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 1fr 100px 100px 100px',
                      padding: '0.625rem 1rem',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: '0.875rem',
                      background: difference !== 0 ? '#fffbeb' : '#ffffff',
                    }}
                  >
                    <div style={{ fontWeight: 500, color: '#0369a1' }}>{item.cptCode}</div>
                    <div style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description || '-'}
                    </div>
                    <div style={{ textAlign: 'right', color: '#6b7280' }}>
                      {formatCurrency(comparison?.scheduleFee || 0)}
                    </div>
                    <div style={{ textAlign: 'right', color: '#374151' }}>
                      {formatCurrency(item.fee)}
                    </div>
                    <div style={{
                      textAlign: 'right',
                      fontWeight: difference !== 0 ? 600 : 400,
                      color: difference > 0 ? '#059669' : difference < 0 ? '#dc2626' : '#6b7280',
                    }}>
                      {difference !== 0 ? (
                        `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`
                      ) : (
                        '-'
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Total Row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 100px 100px 100px',
                padding: '0.75rem 1rem',
                background: '#f9fafb',
                fontWeight: 600,
              }}>
                <div></div>
                <div style={{ color: '#6b7280' }}>Total</div>
                <div style={{ textAlign: 'right', color: '#6b7280' }}>
                  {formatCurrency(totalScheduleFee)}
                </div>
                <div style={{ textAlign: 'right', color: '#111827' }}>
                  {formatCurrency(totalCurrentFee)}
                </div>
                <div style={{
                  textAlign: 'right',
                  color: totalDifference > 0 ? '#059669' : totalDifference < 0 ? '#dc2626' : '#6b7280',
                }}>
                  {totalDifference !== 0 ? (
                    `${totalDifference > 0 ? '+' : ''}${formatCurrency(totalDifference)}`
                  ) : (
                    '-'
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Info Text */}
      {expanded && !loading && (
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#9ca3af',
        }}>
          Comparing current fees against the default fee schedule
          {payerId && ' for the selected payer'}.
          Positive differences indicate charges above schedule rates.
        </div>
      )}
    </div>
  );
}
