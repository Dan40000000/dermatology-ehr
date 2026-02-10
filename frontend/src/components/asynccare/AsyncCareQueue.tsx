/**
 * AsyncCareQueue Component
 * Provider view of pending async care requests
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import {
  fetchAsyncCareQueue,
  fetchAsyncCareStats,
  type AsyncCareRequest,
  type QueueFilters,
  type RequestStatus,
  type Urgency,
} from '../../api/asyncCare';

interface AsyncCareQueueProps {
  onSelectRequest: (request: AsyncCareRequest) => void;
  selectedRequestId?: string;
}

export function AsyncCareQueue({ onSelectRequest, selectedRequestId }: AsyncCareQueueProps) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AsyncCareRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{
    byStatus: Record<string, number>;
    byUrgency: Record<string, number>;
    avgHoursToView: string | null;
  } | null>(null);

  const [filters, setFilters] = useState<QueueFilters>({
    status: ['pending', 'in_review'],
  });

  const loadData = useCallback(async () => {
    if (!session) return;

    setLoading(true);
    try {
      const [queueRes, statsRes] = await Promise.all([
        fetchAsyncCareQueue(
          { tenantId: session.tenantId, accessToken: session.accessToken },
          filters
        ),
        fetchAsyncCareStats({ tenantId: session.tenantId, accessToken: session.accessToken }),
      ]);

      setRequests(queueRes.requests);
      setTotal(queueRes.total);
      setStats(statsRes);
    } catch (error) {
      console.error('Failed to load queue:', error);
    } finally {
      setLoading(false);
    }
  }, [session, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getUrgencyColor = (urgency: Urgency) => {
    switch (urgency) {
      case 'urgent':
        return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      case 'soon':
        return { bg: '#fffbeb', color: '#d97706', border: '#fde68a' };
      default:
        return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
    }
  };

  const getStatusColor = (status: RequestStatus) => {
    switch (status) {
      case 'pending':
        return { bg: '#fef3c7', color: '#92400e' };
      case 'in_review':
        return { bg: '#dbeafe', color: '#1e40af' };
      case 'responded':
        return { bg: '#d1fae5', color: '#065f46' };
      case 'closed':
        return { bg: '#f3f4f6', color: '#6b7280' };
      default:
        return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'photo_consult':
        return 'Photo Consult';
      case 'follow_up':
        return 'Follow-up';
      case 'new_concern':
        return 'New Concern';
      case 'medication_question':
        return 'Medication Question';
      default:
        return type;
    }
  };

  return (
    <div className="async-care-queue">
      {/* Stats Cards */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              padding: '1rem',
              background: '#fef3c7',
              borderRadius: '8px',
              border: '1px solid #fde68a',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#92400e' }}>
              {stats.byStatus.pending || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#92400e' }}>Pending</div>
          </div>
          <div
            style={{
              padding: '1rem',
              background: '#dbeafe',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1e40af' }}>
              {stats.byStatus.in_review || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#1e40af' }}>In Review</div>
          </div>
          <div
            style={{
              padding: '1rem',
              background: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#dc2626' }}>
              {stats.byUrgency.urgent || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>Urgent</div>
          </div>
          <div
            style={{
              padding: '1rem',
              background: '#f0f9ff',
              borderRadius: '8px',
              border: '1px solid #bae6fd',
            }}
          >
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0369a1' }}>
              {stats.avgHoursToView ? `${stats.avgHoursToView}h` : '--'}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#0369a1' }}>Avg. Response</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={
            Array.isArray(filters.status)
              ? filters.status.join(',')
              : filters.status || ''
          }
          onChange={(e) => {
            const value = e.target.value;
            setFilters((prev) => ({
              ...prev,
              status: value ? (value.split(',') as RequestStatus[]) : undefined,
            }));
          }}
          style={{
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
          }}
        >
          <option value="pending,in_review">Active Requests</option>
          <option value="pending">Pending Only</option>
          <option value="in_review">In Review Only</option>
          <option value="responded">Responded</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </select>

        <select
          value={filters.urgency || ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              urgency: (e.target.value as Urgency) || undefined,
            }))
          }
          style={{
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
          }}
        >
          <option value="">All Urgencies</option>
          <option value="urgent">Urgent</option>
          <option value="soon">Soon</option>
          <option value="routine">Routine</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={filters.unassignedOnly || false}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                unassignedOnly: e.target.checked,
              }))
            }
          />
          Unassigned only
        </label>

        <Button variant="ghost" onClick={loadData} size="sm">
          Refresh
        </Button>
      </div>

      {/* Request List */}
      {loading ? (
        <Skeleton variant="card" height={200} />
      ) : requests.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Inbox</div>
          <p style={{ color: '#6b7280', margin: 0 }}>No requests in queue</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {requests.map((request) => {
            const urgencyColors = getUrgencyColor(request.urgency);
            const statusColors = getStatusColor(request.status);
            const isSelected = request.id === selectedRequestId;

            return (
              <div
                key={request.id}
                onClick={() => onSelectRequest(request)}
                style={{
                  padding: '1rem',
                  background: isSelected ? '#eff6ff' : '#fff',
                  border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontWeight: 600,
                        color: '#1f2937',
                        fontSize: '1rem',
                      }}
                    >
                      {request.patientLastName}, {request.patientFirstName}
                    </span>
                    <span
                      style={{
                        marginLeft: '0.75rem',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                      }}
                    >
                      {getRequestTypeLabel(request.requestType)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {/* Urgency Badge */}
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '4px',
                        background: urgencyColors.bg,
                        color: urgencyColors.color,
                        border: `1px solid ${urgencyColors.border}`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {request.urgency}
                    </span>

                    {/* Status Badge */}
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        borderRadius: '4px',
                        background: statusColors.bg,
                        color: statusColors.color,
                      }}
                    >
                      {request.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Chief Complaint */}
                {request.chiefComplaint && (
                  <p
                    style={{
                      margin: '0 0 0.5rem',
                      fontSize: '0.875rem',
                      color: '#4b5563',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {request.chiefComplaint}
                  </p>
                )}

                {/* Meta Info */}
                <div
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                  }}
                >
                  <span>Submitted {formatTimeAgo(request.submittedAt)}</span>
                  {request.photoCount !== undefined && (
                    <span>{request.photoCount} photo{request.photoCount !== 1 ? 's' : ''}</span>
                  )}
                  {request.assignedProviderName && (
                    <span>Assigned to {request.assignedProviderName}</span>
                  )}
                  {!request.assignedProviderId && (
                    <span style={{ color: '#f59e0b' }}>Unassigned</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination Info */}
          {total > requests.length && (
            <div
              style={{
                textAlign: 'center',
                padding: '1rem',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              Showing {requests.length} of {total} requests
            </div>
          )}
        </div>
      )}
    </div>
  );
}
