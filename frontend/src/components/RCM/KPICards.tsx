import React from 'react';

interface KPIData {
  totalCharges: number;
  totalCollections: number;
  collectionRate: number;
  daysInAR: number;
  denialRate: number;
  cleanClaimRate: number;
  netCollectionRate: number;
  totalAR: number;
}

interface KPICardsProps {
  current: KPIData;
  previous: KPIData;
  benchmarks?: any;
}

export function KPICards({ current, previous, benchmarks }: KPICardsProps) {
  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const getComparisonColor = (current: number, previous: number, higherIsBetter: boolean = true) => {
    const change = calculateChange(current, previous);
    if (Math.abs(change) < 1) return 'text-gray-600';
    if (higherIsBetter) {
      return change > 0 ? 'text-green-600' : 'text-red-600';
    } else {
      return change < 0 ? 'text-green-600' : 'text-red-600';
    }
  };

  const getBenchmarkStatus = (value: number, benchmark: any, higherIsBetter: boolean = true) => {
    if (!benchmark) return 'neutral';
    const target = benchmark.benchmark || benchmark.p50;
    if (higherIsBetter) {
      if (value >= benchmark.p75) return 'excellent';
      if (value >= target) return 'good';
      if (value >= benchmark.p25) return 'fair';
      return 'poor';
    } else {
      if (value <= benchmark.p25) return 'excellent';
      if (value <= target) return 'good';
      if (value <= benchmark.p75) return 'fair';
      return 'poor';
    }
  };

  const renderTrendArrow = (current: number, previous: number, higherIsBetter: boolean = true) => {
    const change = calculateChange(current, previous);
    if (Math.abs(change) < 1) return null;

    const isPositive = higherIsBetter ? change > 0 : change < 0;
    const color = isPositive ? '#10b981' : '#ef4444';

    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
        {isPositive ? (
          <>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </>
        ) : (
          <>
            <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
            <polyline points="17 18 23 18 23 12" />
          </>
        )}
      </svg>
    );
  };

  const kpiCards = [
    {
      label: 'Total Charges',
      value: formatCurrency(current.totalCharges),
      previousValue: previous.totalCharges,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
      color: 'purple',
      higherIsBetter: true,
      benchmarkKey: null,
    },
    {
      label: 'Total Collections',
      value: formatCurrency(current.totalCollections),
      previousValue: previous.totalCollections,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: 'green',
      higherIsBetter: true,
      benchmarkKey: null,
    },
    {
      label: 'Collection Rate',
      value: formatPercent(current.collectionRate),
      previousValue: previous.collectionRate,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
      color: 'blue',
      higherIsBetter: true,
      benchmarkKey: 'collection_rate',
    },
    {
      label: 'Days in A/R',
      value: `${current.daysInAR.toFixed(0)} days`,
      previousValue: previous.daysInAR,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      color: 'orange',
      higherIsBetter: false,
      benchmarkKey: 'days_in_ar',
    },
    {
      label: 'Denial Rate',
      value: formatPercent(current.denialRate),
      previousValue: previous.denialRate,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      ),
      color: 'red',
      higherIsBetter: false,
      benchmarkKey: 'denial_rate',
    },
    {
      label: 'Clean Claim Rate',
      value: formatPercent(current.cleanClaimRate),
      previousValue: previous.cleanClaimRate,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
      color: 'teal',
      higherIsBetter: true,
      benchmarkKey: 'clean_claim_rate',
    },
  ];

  const colorClasses: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
    purple: {
      bg: 'bg-gradient-to-br from-purple-50 to-purple-100',
      border: 'border-l-purple-500',
      icon: 'bg-gradient-to-br from-purple-400 to-purple-600',
      badge: 'bg-purple-100 text-purple-700',
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-green-100',
      border: 'border-l-green-500',
      icon: 'bg-gradient-to-br from-green-400 to-green-600',
      badge: 'bg-green-100 text-green-700',
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
      border: 'border-l-blue-500',
      icon: 'bg-gradient-to-br from-blue-400 to-blue-600',
      badge: 'bg-blue-100 text-blue-700',
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-50 to-orange-100',
      border: 'border-l-orange-500',
      icon: 'bg-gradient-to-br from-orange-400 to-orange-600',
      badge: 'bg-orange-100 text-orange-700',
    },
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-red-100',
      border: 'border-l-red-500',
      icon: 'bg-gradient-to-br from-red-400 to-red-600',
      badge: 'bg-red-100 text-red-700',
    },
    teal: {
      bg: 'bg-gradient-to-br from-teal-50 to-teal-100',
      border: 'border-l-teal-500',
      icon: 'bg-gradient-to-br from-teal-400 to-teal-600',
      badge: 'bg-teal-100 text-teal-700',
    },
  };

  const statusColors: Record<string, string> = {
    excellent: 'bg-green-100 text-green-800 border-green-200',
    good: 'bg-blue-100 text-blue-800 border-blue-200',
    fair: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    poor: 'bg-red-100 text-red-800 border-red-200',
    neutral: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {kpiCards.map((card) => {
        const colors = colorClasses[card.color];
        const changePercent = calculateChange(
          typeof card.previousValue === 'number' ? card.previousValue : 0,
          typeof card.previousValue === 'number' ? card.previousValue : 0
        );
        const benchmark = card.benchmarkKey && benchmarks ? benchmarks[card.benchmarkKey] : null;
        const benchmarkStatus = card.benchmarkKey
          ? getBenchmarkStatus(
              typeof card.previousValue === 'number' ? card.previousValue : 0,
              benchmark,
              card.higherIsBetter
            )
          : 'neutral';

        return (
          <div
            key={card.label}
            className={`relative bg-white rounded-xl shadow-md border-l-4 ${colors.border} overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1`}
          >
            {/* Background pattern */}
            <div className={`absolute inset-0 ${colors.bg} opacity-50`}></div>

            <div className="relative p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg text-white ${colors.icon} shadow-lg`}>{card.icon}</div>
                {benchmark && (
                  <div className={`px-2 py-1 rounded-full text-xs font-semibold border ${statusColors[benchmarkStatus]}`}>
                    {benchmarkStatus.charAt(0).toUpperCase() + benchmarkStatus.slice(1)}
                  </div>
                )}
              </div>

              {/* Value */}
              <div className="mb-2">
                <div className="text-sm font-medium text-gray-600 mb-1">{card.label}</div>
                <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              </div>

              {/* Comparison */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div className="flex items-center space-x-2">
                  {renderTrendArrow(
                    typeof card.previousValue === 'number' ? card.previousValue : 0,
                    typeof card.previousValue === 'number' ? card.previousValue : 0,
                    card.higherIsBetter
                  )}
                  <span
                    className={`text-sm font-semibold ${getComparisonColor(
                      typeof card.previousValue === 'number' ? card.previousValue : 0,
                      typeof card.previousValue === 'number' ? card.previousValue : 0,
                      card.higherIsBetter
                    )}`}
                  >
                    {Math.abs(changePercent).toFixed(1)}% MoM
                  </span>
                </div>
                {benchmark && (
                  <div className="text-xs text-gray-500">
                    Target: {typeof benchmark.benchmark === 'number' ? benchmark.benchmark.toFixed(1) : benchmark.benchmark}
                    {card.label.includes('Rate') || card.label.includes('%') ? '%' : ''}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
