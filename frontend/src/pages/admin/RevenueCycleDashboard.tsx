import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from '../../components/ui';
import { KPICards } from '../../components/RCM/KPICards';
import { AgingChart } from '../../components/RCM/AgingChart';
import { CollectionsTrend } from '../../components/RCM/CollectionsTrend';
import { DenialAnalysis } from '../../components/RCM/DenialAnalysis';
import { PayerMix } from '../../components/RCM/PayerMix';
import { ProviderProductivity } from '../../components/RCM/ProviderProductivity';
import { ActionItems } from '../../components/RCM/ActionItems';
import { FinancialCalendar } from '../../components/RCM/FinancialCalendar';
import { API_BASE_URL } from '../../utils/apiBase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RCMDashboardData {
  kpis: any;
  previousKpis: any;
  arAging: any;
  denialAnalysis: any;
  benchmarks: any;
  alerts: string[];
}

type PeriodType = 'mtd' | 'qtd' | 'ytd';
type TrendView = 'monthly' | 'weekly' | 'daily';

export function RevenueCycleDashboard() {
  const { session } = useAuth();
  const { showError, showSuccess } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('mtd');
  const [trendView, setTrendView] = useState<TrendView>('monthly');

  // Dashboard data
  const [dashboardData, setDashboardData] = useState<RCMDashboardData | null>(null);
  const [collectionsTrend, setCollectionsTrend] = useState<any[]>([]);
  const [payerMix, setPayerMix] = useState<any[]>([]);
  const [providerStats, setProviderStats] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

  const loadDashboardData = useCallback(
    async (isRefresh = false) => {
      if (!session) return;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const baseUrl = API_BASE_URL;
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'x-tenant-id': session.tenantId,
        };

        // Fetch main dashboard data
        const dashboardResponse = await fetch(`${baseUrl}/api/rcm/dashboard?period=${period}`, { headers });
        if (!dashboardResponse.ok) throw new Error('Failed to fetch dashboard data');
        const dashboard = await dashboardResponse.json();
        setDashboardData(dashboard);

        // Calculate date range for additional data
        const today = new Date();
        let startDate: Date;
        let endDate = today;

        if (period === 'mtd') {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        } else if (period === 'qtd') {
          const quarterStart = Math.floor(today.getMonth() / 3) * 3;
          startDate = new Date(today.getFullYear(), quarterStart, 1);
        } else {
          startDate = new Date(today.getFullYear(), 0, 1);
        }

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Fetch additional data in parallel
        const [collectionsRes, payersRes, providersRes, actionsRes, calendarRes] = await Promise.all([
          fetch(
            `${baseUrl}/api/rcm/collections?startDate=${startDateStr}&endDate=${endDateStr}&granularity=${trendView}`,
            { headers }
          ),
          fetch(`${baseUrl}/api/rcm/payer-mix?startDate=${startDateStr}&endDate=${endDateStr}`, { headers }),
          fetch(`${baseUrl}/api/rcm/provider-stats?startDate=${startDateStr}&endDate=${endDateStr}`, { headers }),
          fetch(`${baseUrl}/api/rcm/action-items?limit=20`, { headers }),
          fetch(
            `${baseUrl}/api/rcm/calendar?startDate=${startDateStr}&endDate=${new Date(endDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
            { headers }
          ),
        ]);

        if (collectionsRes.ok) {
          const data = await collectionsRes.json();
          setCollectionsTrend(data.trend || []);
        }

        if (payersRes.ok) {
          const data = await payersRes.json();
          setPayerMix(data.payers || []);
        }

        if (providersRes.ok) {
          const data = await providersRes.json();
          setProviderStats(data.providers || []);
        }

        if (actionsRes.ok) {
          const data = await actionsRes.json();
          setActionItems(data.items || []);
        }

        if (calendarRes.ok) {
          const data = await calendarRes.json();
          setCalendarEvents(data.events || []);
        }

        if (isRefresh) {
          showSuccess('Dashboard refreshed successfully');
        }
      } catch (error: any) {
        console.error('Error loading dashboard:', error);
        showError(error.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session, period, trendView, showError, showSuccess]
  );

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadDashboardData(true);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadDashboardData]);

  const handleExportPDF = useCallback(() => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(20);
      doc.text('Revenue Cycle Management Dashboard', pageWidth / 2, 15, { align: 'center' });

      // Period
      doc.setFontSize(10);
      doc.text(`Period: ${period.toUpperCase()} - ${new Date().toLocaleDateString()}`, pageWidth / 2, 22, {
        align: 'center',
      });

      let yPos = 30;

      // KPI Section
      if (dashboardData?.kpis) {
        doc.setFontSize(14);
        doc.text('Key Performance Indicators', 14, yPos);
        yPos += 7;

        const kpiData = [
          ['Metric', 'Current', 'Previous'],
          ['Total Charges', `$${(dashboardData.kpis.totalCharges / 100).toFixed(0)}`, `$${(dashboardData.previousKpis.totalCharges / 100).toFixed(0)}`],
          ['Total Collections', `$${(dashboardData.kpis.totalCollections / 100).toFixed(0)}`, `$${(dashboardData.previousKpis.totalCollections / 100).toFixed(0)}`],
          ['Collection Rate', `${dashboardData.kpis.collectionRate.toFixed(1)}%`, `${dashboardData.previousKpis.collectionRate.toFixed(1)}%`],
          ['Days in A/R', `${dashboardData.kpis.daysInAR.toFixed(0)} days`, `${dashboardData.previousKpis.daysInAR.toFixed(0)} days`],
          ['Denial Rate', `${dashboardData.kpis.denialRate.toFixed(1)}%`, `${dashboardData.previousKpis.denialRate.toFixed(1)}%`],
          ['Clean Claim Rate', `${dashboardData.kpis.cleanClaimRate.toFixed(1)}%`, `${dashboardData.previousKpis.cleanClaimRate.toFixed(1)}%`],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [kpiData[0]],
          body: kpiData.slice(1),
          theme: 'striped',
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // A/R Aging
      if (dashboardData?.arAging) {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.text('A/R Aging Breakdown', 14, yPos);
        yPos += 7;

        const aging = dashboardData.arAging;
        const agingData = [
          ['Bucket', 'Amount', 'Percentage'],
          ['Current', `$${(aging.current / 100).toFixed(0)}`, `${((aging.current / aging.total) * 100).toFixed(1)}%`],
          ['31-60 Days', `$${(aging.days31_60 / 100).toFixed(0)}`, `${((aging.days31_60 / aging.total) * 100).toFixed(1)}%`],
          ['61-90 Days', `$${(aging.days61_90 / 100).toFixed(0)}`, `${((aging.days61_90 / aging.total) * 100).toFixed(1)}%`],
          ['91-120 Days', `$${(aging.days91_120 / 100).toFixed(0)}`, `${((aging.days91_120 / aging.total) * 100).toFixed(1)}%`],
          ['120+ Days', `$${(aging.days120Plus / 100).toFixed(0)}`, `${((aging.days120Plus / aging.total) * 100).toFixed(1)}%`],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [agingData[0]],
          body: agingData.slice(1),
          theme: 'striped',
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      // Alerts
      if (dashboardData?.alerts && dashboardData.alerts.length > 0) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.text('Alerts & Recommendations', 14, yPos);
        yPos += 7;

        doc.setFontSize(10);
        dashboardData.alerts.forEach((alert, index) => {
          doc.text(`${index + 1}. ${alert}`, 14, yPos);
          yPos += 5;
        });
      }

      // Save PDF
      doc.save(`rcm-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('PDF report generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      showError('Failed to generate PDF report');
    }
  }, [dashboardData, period, showSuccess, showError]);

  const handleExportExcel = useCallback(() => {
    try {
      let csvContent = 'Revenue Cycle Management Dashboard\n';
      csvContent += `Period: ${period.toUpperCase()}\n`;
      csvContent += `Generated: ${new Date().toLocaleDateString()}\n\n`;

      // KPIs
      if (dashboardData?.kpis) {
        csvContent += 'Key Performance Indicators\n';
        csvContent += 'Metric,Current,Previous\n';
        csvContent += `Total Charges,$${(dashboardData.kpis.totalCharges / 100).toFixed(0)},$${(dashboardData.previousKpis.totalCharges / 100).toFixed(0)}\n`;
        csvContent += `Total Collections,$${(dashboardData.kpis.totalCollections / 100).toFixed(0)},$${(dashboardData.previousKpis.totalCollections / 100).toFixed(0)}\n`;
        csvContent += `Collection Rate,${dashboardData.kpis.collectionRate.toFixed(1)}%,${dashboardData.previousKpis.collectionRate.toFixed(1)}%\n`;
        csvContent += `Days in A/R,${dashboardData.kpis.daysInAR.toFixed(0)},${dashboardData.previousKpis.daysInAR.toFixed(0)}\n`;
        csvContent += `Denial Rate,${dashboardData.kpis.denialRate.toFixed(1)}%,${dashboardData.previousKpis.denialRate.toFixed(1)}%\n`;
        csvContent += `Clean Claim Rate,${dashboardData.kpis.cleanClaimRate.toFixed(1)}%,${dashboardData.previousKpis.cleanClaimRate.toFixed(1)}%\n\n`;
      }

      // Payer Mix
      if (payerMix.length > 0) {
        csvContent += 'Payer Performance\n';
        csvContent += 'Payer,Charges,Payments,Denial Rate,Avg Days,Collection Rate\n';
        payerMix.forEach((payer) => {
          csvContent += `${payer.payerName},$${(payer.charges / 100).toFixed(0)},$${(payer.payments / 100).toFixed(0)},${payer.denialRate.toFixed(1)}%,${payer.avgDaysToPay},${payer.collectionRate.toFixed(1)}%\n`;
        });
        csvContent += '\n';
      }

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `rcm-dashboard-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      showSuccess('Excel report generated successfully');
    } catch (error) {
      console.error('Error generating Excel:', error);
      showError('Failed to generate Excel report');
    }
  }, [dashboardData, payerMix, period, showSuccess, showError]);

  const handleResolveAction = async (actionId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rcm/action-items/${actionId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session!.accessToken}`,
          'x-tenant-id': session!.tenantId,
        },
        body: JSON.stringify({ notes: 'Resolved from dashboard' }),
      });

      if (!response.ok) throw new Error('Failed to resolve action item');

      showSuccess('Action item resolved');
      loadDashboardData(true);
    } catch (error: any) {
      console.error('Error resolving action:', error);
      showError(error.message || 'Failed to resolve action item');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 p-6">
        <div className="max-w-[1800px] mx-auto">
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading Revenue Cycle Dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Revenue Cycle Management</h1>
              <p className="text-gray-600 mt-1">
                Comprehensive practice financial health dashboard - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-2 px-4 py-2 bg-white rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700">Auto-refresh (5 min)</span>
              </label>
              <button
                onClick={() => loadDashboardData(true)}
                disabled={refreshing}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                Export PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Export Excel
              </button>
            </div>
          </div>

          {/* Period Selector */}
          <div className="flex space-x-2">
            {(['mtd', 'qtd', 'ytd'] as PeriodType[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  period === p
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-semibold text-yellow-800">Performance Alerts</h3>
                <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                  {dashboardData.alerts.map((alert, index) => (
                    <li key={index}>{alert}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        {dashboardData && (
          <KPICards
            current={dashboardData.kpis}
            previous={dashboardData.previousKpis}
            benchmarks={dashboardData.benchmarks}
          />
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* A/R Aging */}
          {dashboardData?.arAging && <AgingChart data={dashboardData.arAging} />}

          {/* Collections Trend */}
          <CollectionsTrend data={collectionsTrend} view={trendView} onViewChange={setTrendView} />
        </div>

        {/* Denial Analysis */}
        {dashboardData?.denialAnalysis && (
          <div className="mb-6">
            <DenialAnalysis
              topReasons={dashboardData.denialAnalysis.topReasons}
              totalDenials={dashboardData.denialAnalysis.totalDenials}
              totalDenialAmount={dashboardData.denialAnalysis.totalDenialAmount}
              recoveryRate={dashboardData.denialAnalysis.recoveryRate}
            />
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Action Items */}
          <ActionItems items={actionItems} onResolve={handleResolveAction} />

          {/* Financial Calendar */}
          <FinancialCalendar events={calendarEvents} />
        </div>

        {/* Payer Performance */}
        {payerMix.length > 0 && (
          <div className="mb-6">
            <PayerMix payers={payerMix} />
          </div>
        )}

        {/* Provider Productivity */}
        {providerStats.length > 0 && (
          <div className="mb-6">
            <ProviderProductivity providers={providerStats} />
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            Data updates in real-time. Last refreshed: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}
