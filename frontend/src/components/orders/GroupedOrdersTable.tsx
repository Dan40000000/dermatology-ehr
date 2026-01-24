import { useState } from 'react';
import { InsuranceStatusBadge } from '../Insurance';
import type { Order, Patient, OrderGroupBy } from '../../types';

interface GroupedOrdersTableProps {
  orders: Order[];
  patients: Patient[];
  groupBy: OrderGroupBy;
  selectedOrders: Set<string>;
  onToggleOrder: (orderId: string) => void;
  onToggleSelectAll: () => void;
  onStatusChange: (orderId: string, status: string) => void;
  getPatientName: (patientId: string) => string;
  eligibilityByPatient?: Record<string, EligibilityHistoryItem | null>;
  getPatientInsurance?: (patientId: string) => string | null;
  eligibilityLoading?: boolean;
}

interface OrderGroup {
  key: string;
  label: string;
  orders: Order[];
}

type EligibilityHistoryItem = {
  verification_status?: string;
  verified_at?: string;
  has_issues?: boolean;
  issue_notes?: string | null;
};

export function GroupedOrdersTable({
  orders,
  patients,
  groupBy,
  selectedOrders,
  onToggleOrder,
  onToggleSelectAll,
  onStatusChange,
  getPatientName,
  eligibilityByPatient,
  getPatientInsurance,
  eligibilityLoading = false,
}: GroupedOrdersTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupKey: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(groupKey)) {
      newCollapsed.delete(groupKey);
    } else {
      newCollapsed.add(groupKey);
    }
    setCollapsedGroups(newCollapsed);
  };

  const getOrderGroups = (): OrderGroup[] => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'All Orders', orders }];
    }

    const groups = new Map<string, Order[]>();

    orders.forEach((order) => {
      let groupKey: string;
      if (groupBy === 'patient') {
        groupKey = order.patientId;
      } else if (groupBy === 'provider') {
        groupKey = order.providerId;
      } else {
        groupKey = 'all';
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(order);
    });

    const result: OrderGroup[] = [];
    groups.forEach((groupOrders, key) => {
      let label: string;
      if (groupBy === 'patient') {
        label = getPatientName(key);
      } else if (groupBy === 'provider') {
        label = groupOrders[0]?.providerName || `Provider ${key}`;
      } else {
        label = 'All Orders';
      }
      result.push({ key, label, orders: groupOrders });
    });

    return result.sort((a, b) => a.label.localeCompare(b.label));
  };

  const orderGroups = getOrderGroups();

  const getPriorityStyle = (priority?: string) => {
    switch (priority) {
      case 'stat':
        return { background: '#dc2626', color: '#ffffff' };
      case 'urgent':
      case 'high':
        return { background: '#f59e0b', color: '#ffffff' };
      default:
        return { background: '#e5e7eb', color: '#374151' };
    }
  };

  const getOrderTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      followup: 'Follow Up',
      infusion: 'Infusion',
      injection: 'Injection',
      lab: 'Labs',
      pathology: 'Pathology',
      radiology: 'Radiology',
      referral: 'Referral',
      surgery: 'Surgery',
      biopsy: 'Biopsy',
      imaging: 'Imaging',
      procedure: 'Procedure',
      rx: 'Prescription',
    };
    return typeMap[type] || type;
  };

  if (groupBy === 'none') {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="ema-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.813rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ width: '40px', padding: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={selectedOrders.size === orders.length && orders.length > 0}
                  onChange={onToggleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Date</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Patient Name</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                Coverage{eligibilityLoading ? <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>updating...</span> : null}
              </th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Number</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Name</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Provider</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Facility</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Perform At</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Due Date</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Scheduled Date</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Workflow Status</th>
              <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                isSelected={selectedOrders.has(order.id)}
                onToggle={onToggleOrder}
                onStatusChange={onStatusChange}
                getPatientName={getPatientName}
                eligibility={eligibilityByPatient?.[order.patientId]}
                insuranceLabel={getPatientInsurance?.(order.patientId) ?? null}
                getPriorityStyle={getPriorityStyle}
                getOrderTypeLabel={getOrderTypeLabel}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {orderGroups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.key);
        return (
          <div
            key={group.key}
            style={{
              background: '#fff',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <div
              onClick={() => toggleGroup(group.key)}
              style={{
                padding: '1rem',
                background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                  {group.label}
                </h3>
              </div>
              <span style={{ fontSize: '0.875rem', background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.75rem', borderRadius: '12px' }}>
                {group.orders.length} {group.orders.length === 1 ? 'order' : 'orders'}
              </span>
            </div>

            {!isCollapsed && (
              <div style={{ overflowX: 'auto' }}>
                <table className="ema-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.813rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ width: '40px', padding: '0.75rem' }}>
                        <input
                          type="checkbox"
                          checked={group.orders.every((o) => selectedOrders.has(o.id))}
                          onChange={() => {
                            group.orders.forEach((o) => onToggleOrder(o.id));
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Date</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Patient Name</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                        Coverage{eligibilityLoading ? <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>updating...</span> : null}
                      </th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Number</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Name</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Provider</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Facility</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Perform At</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Due Date</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Scheduled Date</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Workflow Status</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Order Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.orders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        isSelected={selectedOrders.has(order.id)}
                        onToggle={onToggleOrder}
                        onStatusChange={onStatusChange}
                        getPatientName={getPatientName}
                        eligibility={eligibilityByPatient?.[order.patientId]}
                        insuranceLabel={getPatientInsurance?.(order.patientId) ?? null}
                        getPriorityStyle={getPriorityStyle}
                        getOrderTypeLabel={getOrderTypeLabel}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface OrderRowProps {
  order: Order;
  isSelected: boolean;
  onToggle: (orderId: string) => void;
  onStatusChange: (orderId: string, status: string) => void;
  getPatientName: (patientId: string) => string;
  eligibility?: EligibilityHistoryItem | null;
  insuranceLabel?: string | null;
  getPriorityStyle: (priority?: string) => { background: string; color: string };
  getOrderTypeLabel: (type: string) => string;
}

function OrderRow({
  order,
  isSelected,
  onToggle,
  onStatusChange,
  getPatientName,
  eligibility,
  insuranceLabel,
  getPriorityStyle,
  getOrderTypeLabel,
}: OrderRowProps) {
  const rowBackground =
    order.priority === 'stat'
      ? '#fef2f2'
      : order.status === 'completed' || order.status === 'closed'
      ? '#f0fdf4'
      : undefined;

  // Generate mock order number from order ID
  const orderNumber = `ORD-${order.id.substring(0, 8).toUpperCase()}`;

  // Mock dates - in real implementation these would come from the order object
  const dueDate = order.createdAt ? new Date(new Date(order.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000) : null;
  const scheduledDate = order.createdAt ? new Date(new Date(order.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000) : null;

  return (
    <tr style={{ background: rowBackground, borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '0.75rem' }}>
        <input type="checkbox" checked={isSelected} onChange={() => onToggle(order.id)} style={{ cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#374151' }}>
        {new Date(order.createdAt).toLocaleDateString()}
      </td>
      <td style={{ padding: '0.75rem' }}>
        <a href="#" className="ema-patient-link" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, fontSize: '0.813rem' }}>
          {getPatientName(order.patientId)}
        </a>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <InsuranceStatusBadge
            status={eligibility?.verification_status}
            verifiedAt={eligibility?.verified_at}
            hasIssues={eligibility?.has_issues}
            size="sm"
          />
          {insuranceLabel ? (
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{insuranceLabel}</span>
          ) : (
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>No insurance</span>
          )}
        </div>
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#6b7280', fontFamily: 'monospace' }}>
        {orderNumber}
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#374151' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              background: '#e0e7ff',
              color: '#4338ca',
              padding: '0.125rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {getOrderTypeLabel(order.type)}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }} title={order.details}>
            {order.details}
          </span>
        </div>
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#374151' }}>
        {order.providerName || 'Dr. Smith'}
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#6b7280' }}>
        Main Clinic
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#6b7280' }}>
        Lab
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#374151' }}>
        {dueDate ? dueDate.toLocaleDateString() : '-'}
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.813rem', color: '#374151' }}>
        {scheduledDate ? scheduledDate.toLocaleDateString() : '-'}
      </td>
      <td style={{ padding: '0.75rem' }}>
        {order.priority === 'stat' ? (
          <span
            style={{
              background: '#dc2626',
              color: '#ffffff',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'inline-block',
            }}
          >
            STAT
          </span>
        ) : order.priority === 'high' || order.priority === 'urgent' ? (
          <span
            style={{
              background: '#f59e0b',
              color: '#ffffff',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'inline-block',
            }}
          >
            High
          </span>
        ) : (
          <span style={{ fontSize: '0.813rem', color: '#6b7280' }}>Normal</span>
        )}
      </td>
      <td style={{ padding: '0.75rem' }}>
        <span
          style={{
            background:
              order.status === 'completed' || order.status === 'closed'
                ? '#d1fae5'
                : order.status === 'in-progress'
                ? '#dbeafe'
                : order.status === 'sent'
                ? '#e0e7ff'
                : order.status === 'canceled' || order.status === 'cancelled'
                ? '#fee2e2'
                : '#fef3c7',
            color:
              order.status === 'completed' || order.status === 'closed'
                ? '#065f46'
                : order.status === 'in-progress'
                ? '#1e40af'
                : order.status === 'sent'
                ? '#3730a3'
                : order.status === 'canceled' || order.status === 'cancelled'
                ? '#991b1b'
                : '#92400e',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'inline-block',
            textTransform: 'capitalize',
          }}
        >
          {order.status}
        </span>
      </td>
    </tr>
  );
}
