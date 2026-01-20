import React, { useEffect, useState } from "react";
import { api } from "../api";
import { AgingBuckets } from "../components/Collections/AgingBuckets";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  TrendingUp,
  DollarSign,
  Target,
  Calendar,
  Download,
  RefreshCw,
} from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface CollectionStats {
  date: string;
  totalCharges: number;
  collectedAtCheckin: number;
  collectedAtCheckout: number;
  collectedViaStatement: number;
  collectedViaPortal: number;
  totalCollected: number;
  collectionRateAtService: number;
  overallCollectionRate: number;
}

interface AgingReport {
  buckets: {
    current: number;
    days31_60: number;
    days61_90: number;
    over90: number;
    total: number;
    patientCount: number;
  };
  patients: Array<{
    patientId: string;
    patientName: string;
    totalBalance: number;
    currentBalance: number;
    balance31_60: number;
    balance61_90: number;
    balanceOver90: number;
    oldestChargeDate: string | null;
  }>;
}

export function CollectionsReportPage() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });
  const [stats, setStats] = useState<CollectionStats[]>([]);
  const [summary, setSummary] = useState({
    totalCharges: 0,
    totalCollected: 0,
    collectedAtService: 0,
    overallCollectionRate: 0,
    serviceCollectionRate: 0,
  });
  const [agingReport, setAgingReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "aging" | "trends">(
    "overview"
  );

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch collection stats
      const statsResponse = await api.get("/api/collections/stats", {
        params: dateRange,
      });
      setStats(statsResponse.data.stats);
      setSummary(statsResponse.data.summary);

      // Fetch aging report
      const agingResponse = await api.get("/api/collections/aging");
      setAgingReport(agingResponse.data);
    } catch (err) {
      console.error("Error fetching collections data:", err);
      setError("Failed to load collections data");
    } finally {
      setLoading(false);
    }
  };

  const chartData = {
    labels: stats.map((s) => new Date(s.date).toLocaleDateString()),
    datasets: [
      {
        label: "Total Collected",
        data: stats.map((s) => s.totalCollected),
        borderColor: "rgb(34, 197, 94)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        tension: 0.4,
      },
      {
        label: "Collected at Service",
        data: stats.map((s) => s.collectedAtCheckin + s.collectedAtCheckout),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: true,
        text: "Collection Trends",
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: any) {
            return "$" + value.toFixed(0);
          },
        },
      },
    },
  };

  const collectionRateChartData = {
    labels: stats.map((s) => new Date(s.date).toLocaleDateString()),
    datasets: [
      {
        label: "Collection Rate at Service (%)",
        data: stats.map((s) => s.collectionRateAtService || 0),
        borderColor: "rgb(168, 85, 247)",
        backgroundColor: "rgba(168, 85, 247, 0.1)",
        tension: 0.4,
      },
      {
        label: "Overall Collection Rate (%)",
        data: stats.map((s) => s.overallCollectionRate || 0),
        borderColor: "rgb(249, 115, 22)",
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        tension: 0.4,
      },
    ],
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Collections Report</h1>
          <p className="text-gray-600">
            Monitor collection rates and outstanding balances
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <Calendar className="h-5 w-5 text-gray-500" />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">From:</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, startDate: e.target.value })
              }
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">To:</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, endDate: e.target.value })
              }
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() =>
                setDateRange({
                  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0],
                  endDate: new Date().toISOString().split("T")[0],
                })
              }
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Last 7 Days
            </button>
            <button
              onClick={() =>
                setDateRange({
                  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0],
                  endDate: new Date().toISOString().split("T")[0],
                })
              }
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Last 30 Days
            </button>
            <button
              onClick={() =>
                setDateRange({
                  startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0],
                  endDate: new Date().toISOString().split("T")[0],
                })
              }
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Last 90 Days
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {(["overview", "aging", "trends"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-blue-700">
                  Total Charges
                </div>
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-blue-900">
                ${summary.totalCharges.toFixed(2)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-green-700">
                  Total Collected
                </div>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-green-900">
                ${summary.totalCollected.toFixed(2)}
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-purple-700">
                  At Service Rate
                </div>
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-purple-900">
                {summary.serviceCollectionRate.toFixed(1)}%
              </div>
              <div className="text-xs text-purple-600 mt-1">
                Goal: 80%+
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6 border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-orange-700">
                  Overall Rate
                </div>
                <TrendingUp className="h-5 w-5 text-orange-600" />
              </div>
              <div className="text-3xl font-bold text-orange-900">
                {summary.overallCollectionRate.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Collection by Point */}
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Collection Points
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Check-In</div>
                <div className="text-2xl font-bold text-gray-900">
                  $
                  {stats
                    .reduce((sum, s) => sum + s.collectedAtCheckin, 0)
                    .toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Check-Out</div>
                <div className="text-2xl font-bold text-gray-900">
                  $
                  {stats
                    .reduce((sum, s) => sum + s.collectedAtCheckout, 0)
                    .toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Statement</div>
                <div className="text-2xl font-bold text-gray-900">
                  $
                  {stats
                    .reduce((sum, s) => sum + s.collectedViaStatement, 0)
                    .toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-1">Portal</div>
                <div className="text-2xl font-bold text-gray-900">
                  $
                  {stats
                    .reduce((sum, s) => sum + s.collectedViaPortal, 0)
                    .toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aging Tab */}
      {activeTab === "aging" && agingReport && (
        <AgingBuckets
          buckets={agingReport.buckets}
          patients={agingReport.patients}
        />
      )}

      {/* Trends Tab */}
      {activeTab === "trends" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <Line data={chartData} options={chartOptions} />
          </div>
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <Line data={collectionRateChartData} options={chartOptions} />
          </div>
        </div>
      )}
    </div>
  );
}
