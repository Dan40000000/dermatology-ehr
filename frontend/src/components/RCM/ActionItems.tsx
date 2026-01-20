import React from 'react';

interface ActionItem {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string;
  patientId?: string;
  patientName?: string;
  amountCents?: number;
  dueDate?: string;
  status: string;
}

interface ActionItemsProps {
  items: ActionItem[];
  onResolve?: (id: string) => void;
  onView?: (id: string) => void;
}

export function ActionItems({ items, onResolve, onView }: ActionItemsProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'denial_appeal':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'claim_review':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'patient_collection':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'prior_auth_expiring':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'claim_scrub':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getDaysUntilDue = (dueDate?: string) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Action Items</h3>
          <p className="text-sm text-gray-600 mt-1">Items requiring immediate attention</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
            {items.filter(i => i.priority === 'urgent').length} Urgent
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-800">
            {items.filter(i => i.priority === 'high').length} High
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-600 font-medium">No action items</p>
            <p className="text-sm text-gray-500 mt-1">Great job! Everything is up to date.</p>
          </div>
        ) : (
          items.map((item) => {
            const daysUntilDue = getDaysUntilDue(item.dueDate);
            const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
            const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;

            return (
              <div
                key={item.id}
                className={`p-4 border-2 rounded-lg transition-all hover:shadow-md ${
                  item.priority === 'urgent' ? 'border-red-200 bg-red-50' :
                  item.priority === 'high' ? 'border-orange-200 bg-orange-50' :
                  'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={`mt-1 p-2 rounded-lg ${item.priority === 'urgent' ? 'bg-red-200 text-red-700' : item.priority === 'high' ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-700'}`}>
                      {getTypeIcon(item.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold border ${getPriorityColor(item.priority)}`}>
                          {item.priority.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-600 font-medium">{getTypeLabel(item.type)}</span>
                      </div>
                      <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                      {item.description && (
                        <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-sm">
                        {item.patientName && (
                          <span className="text-gray-700">
                            <span className="font-medium">Patient:</span> {item.patientName}
                          </span>
                        )}
                        {item.amountCents && (
                          <span className="text-gray-700">
                            <span className="font-medium">Amount:</span> {formatCurrency(item.amountCents)}
                          </span>
                        )}
                        {item.dueDate && (
                          <span className={`${isOverdue ? 'text-red-600 font-semibold' : isDueSoon ? 'text-orange-600 font-semibold' : 'text-gray-700'}`}>
                            <span className="font-medium">Due:</span>{' '}
                            {isOverdue ? `Overdue by ${Math.abs(daysUntilDue!)} days` :
                             isDueSoon ? `Due in ${daysUntilDue} days` :
                             new Date(item.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {onView && (
                      <button
                        onClick={() => onView(item.id)}
                        className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        View
                      </button>
                    )}
                    {onResolve && (
                      <button
                        onClick={() => onResolve(item.id)}
                        className="px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Showing {items.length} action item{items.length !== 1 ? 's' : ''}
            </span>
            <button className="text-purple-600 hover:text-purple-700 font-medium">
              View All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
