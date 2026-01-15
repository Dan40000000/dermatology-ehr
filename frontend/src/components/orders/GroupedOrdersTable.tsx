import { useState } from 'react';
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
}

interface OrderGroup {
  key: string;
  label: string;
  orders: Order[];
}

export function GroupedOrdersTable({
  orders,
  patients,
  groupBy,
  selectedOrders,
  onToggleOrder,
  onToggleSelectAll,
  onStatusChange,
  getPatientName,
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
      <table className="ema-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Type</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Patient</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Details</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Priority</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Created</th>
            <th style={{ textAlign: 'left', padding: '0.75rem' }}>Actions</th>
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
              getPriorityStyle={getPriorityStyle}
              getOrderTypeLabel={getOrderTypeLabel}
            />
          ))}
        </tbody>
      </table>
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
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
              <table className="ema-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Patient</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Details</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Priority</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Created</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Actions</th>
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
                      getPriorityStyle={getPriorityStyle}
                      getOrderTypeLabel={getOrderTypeLabel}
                    />
                  ))}
                </tbody>
              </table>
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
  getPriorityStyle: (priority?: string) => { background: string; color: string };
  getOrderTypeLabel: (type: string) => string;
}

function OrderRow({
  order,
  isSelected,
  onToggle,
  onStatusChange,
  getPatientName,
  getPriorityStyle,
  getOrderTypeLabel,
}: OrderRowProps) {
  const priorityStyle = getPriorityStyle(order.priority);
  const rowBackground =
    order.priority === 'stat'
      ? '#fef2f2'
      : order.status === 'completed' || order.status === 'closed'
      ? '#f0fdf4'
      : undefined;

  return (
    <tr style={{ background: rowBackground, borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '0.75rem' }}>
        <input type="checkbox" checked={isSelected} onChange={() => onToggle(order.id)} style={{ cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '0.75rem' }}>
        <span
          style={{
            background: '#e0f2fe',
            color: '#0369a1',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            display: 'inline-block',
          }}
        >
          {getOrderTypeLabel(order.type)}
        </span>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <a href="#" className="ema-patient-link" style={{ color: '#059669', textDecoration: 'none' }}>
          {getPatientName(order.patientId)}
        </a>
      </td>
      <td style={{ padding: '0.75rem', maxWidth: '250px' }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.details}>
          {order.details}
        </div>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <span
          style={{
            ...priorityStyle,
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'inline-block',
          }}
        >
          {order.priority === 'stat' ? 'STAT' : order.priority === 'urgent' || order.priority === 'high' ? 'High' : 'Normal'}
        </span>
      </td>
      <td style={{ padding: '0.75rem' }}>
        <span
          className={`ema-status ${
            order.status === 'completed' || order.status === 'closed'
              ? 'established'
              : order.status === 'cancelled' || order.status === 'canceled'
              ? 'cancelled'
              : 'pending'
          }`}
          style={{ fontSize: '0.75rem' }}
        >
          {order.status}
        </span>
      </td>
      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
        {new Date(order.createdAt).toLocaleDateString()}
      </td>
      <td style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {(order.status === 'pending' || order.status === 'open') && (
            <>
              <button
                type="button"
                onClick={() => onStatusChange(order.id, 'in-progress')}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => onStatusChange(order.id, 'cancelled')}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Cancel
              </button>
            </>
          )}
          {order.status === 'in-progress' && (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, 'completed')}
              style={{
                padding: '0.25rem 0.5rem',
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Complete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
