import React, { useState } from "react";
import { TrendingDown, TrendingUp, Users, DollarSign } from "lucide-react";

interface AgingBucket {
  current: number;
  days31_60: number;
  days61_90: number;
  over90: number;
  total: number;
  patientCount: number;
}

interface Patient {
  patientId: string;
  patientName: string;
  totalBalance: number;
  currentBalance: number;
  balance31_60: number;
  balance61_90: number;
  balanceOver90: number;
  oldestChargeDate: string | null;
}

interface AgingBucketsProps {
  buckets: AgingBucket;
  patients: Patient[];
  onPatientClick?: (patientId: string) => void;
}

export function AgingBuckets({ buckets, patients, onPatientClick }: AgingBucketsProps) {
  const [selectedBucket, setSelectedBucket] = useState<
    "current" | "31-60" | "61-90" | "90+" | null
  >(null);

  const bucketData = [
    {
      key: "current" as const,
      label: "Current (0-30 days)",
      amount: buckets.current,
      color: "green",
      bgColor: "bg-green-50",
      borderColor: "border-green-500",
      textColor: "text-green-700",
      barColor: "bg-green-500",
    },
    {
      key: "31-60" as const,
      label: "31-60 days",
      amount: buckets.days31_60,
      color: "yellow",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-500",
      textColor: "text-yellow-700",
      barColor: "bg-yellow-500",
    },
    {
      key: "61-90" as const,
      label: "61-90 days",
      amount: buckets.days61_90,
      color: "orange",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-500",
      textColor: "text-orange-700",
      barColor: "bg-orange-500",
    },
    {
      key: "90+" as const,
      label: "Over 90 days",
      amount: buckets.over90,
      color: "red",
      bgColor: "bg-red-50",
      borderColor: "border-red-500",
      textColor: "text-red-700",
      barColor: "bg-red-500",
    },
  ];

  const maxAmount = Math.max(...bucketData.map((b) => b.amount));

  const getFilteredPatients = () => {
    if (!selectedBucket) return [];

    return patients.filter((p) => {
      switch (selectedBucket) {
        case "current":
          return p.currentBalance > 0;
        case "31-60":
          return p.balance31_60 > 0;
        case "61-90":
          return p.balance61_90 > 0;
        case "90+":
          return p.balanceOver90 > 0;
        default:
          return false;
      }
    });
  };

  const filteredPatients = getFilteredPatients();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-blue-700 mb-1">Total AR</div>
              <div className="text-3xl font-bold text-blue-900">
                ${buckets.total.toFixed(2)}
              </div>
            </div>
            <DollarSign className="h-12 w-12 text-blue-600 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-purple-700 mb-1">Patients with Balance</div>
              <div className="text-3xl font-bold text-purple-900">
                {buckets.patientCount}
              </div>
            </div>
            <Users className="h-12 w-12 text-purple-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Aging Buckets */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Aging Analysis</h3>
          <p className="text-sm text-gray-600">Click a bucket to see patients</p>
        </div>

        <div className="p-6 space-y-4">
          {bucketData.map((bucket) => {
            const percentage =
              buckets.total > 0 ? (bucket.amount / buckets.total) * 100 : 0;
            const barWidth = maxAmount > 0 ? (bucket.amount / maxAmount) * 100 : 0;
            const isSelected = selectedBucket === bucket.key;

            return (
              <button
                key={bucket.key}
                onClick={() =>
                  setSelectedBucket(isSelected ? null : bucket.key)
                }
                className={`w-full text-left transition-all ${
                  isSelected ? "scale-[1.02]" : "hover:scale-[1.01]"
                }`}
              >
                <div
                  className={`rounded-lg border-2 p-4 ${
                    isSelected
                      ? `${bucket.bgColor} ${bucket.borderColor}`
                      : "bg-gray-50 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${bucket.textColor}`}>
                        {bucket.label}
                      </div>
                      <div className="text-2xl font-bold text-gray-900">
                        ${bucket.amount.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${bucket.textColor}`}>
                        {percentage.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">of total AR</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`${bucket.barColor} h-full transition-all duration-500`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Patient List */}
      {selectedBucket && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Patients in {bucketData.find((b) => b.key === selectedBucket)?.label}
            </h3>
            <p className="text-sm text-gray-600">
              {filteredPatients.length} patient{filteredPatients.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredPatients.map((patient) => (
              <button
                key={patient.patientId}
                onClick={() => onPatientClick?.(patient.patientId)}
                className="w-full px-6 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">
                      {patient.patientName}
                    </div>
                    {patient.oldestChargeDate && (
                      <div className="text-sm text-gray-500">
                        Oldest charge:{" "}
                        {new Date(patient.oldestChargeDate).toLocaleDateString()} (
                        {Math.floor(
                          (Date.now() - new Date(patient.oldestChargeDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )}{" "}
                        days)
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-gray-900">
                      ${patient.totalBalance.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-500">total balance</div>
                  </div>
                </div>

                {/* Balance Breakdown */}
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500">Current</div>
                    <div className="font-semibold">
                      ${patient.currentBalance.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">31-60</div>
                    <div className="font-semibold text-yellow-600">
                      ${patient.balance31_60.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">61-90</div>
                    <div className="font-semibold text-orange-600">
                      ${patient.balance61_90.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">90+</div>
                    <div className="font-semibold text-red-600">
                      ${patient.balanceOver90.toFixed(2)}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {filteredPatients.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500">
                No patients in this bucket
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
