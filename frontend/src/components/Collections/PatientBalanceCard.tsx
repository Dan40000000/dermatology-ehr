import React, { useEffect, useState } from "react";
import { api } from "../../api";
import { Alert, AlertDescription } from "../ui/alert";
import { CreditCard, DollarSign, Calendar, TrendingUp } from "lucide-react";

interface PatientBalance {
  patientId: string;
  totalBalance: number;
  currentBalance: number;
  balance31_60: number;
  balance61_90: number;
  balanceOver90: number;
  oldestChargeDate: string | null;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
  hasPaymentPlan: boolean;
  hasAutopay: boolean;
  talkingPoints?: {
    script: string;
    tips: string[];
  };
}

interface CostEstimate {
  estimatedTotal: number;
  breakdown: {
    totalCharges: number;
    copay: number;
    deductible: number;
    coinsurance: number;
  };
}

interface PatientBalanceCardProps {
  patientId: string;
  encounterId?: string;
  estimatedVisitCost?: number;
  onPaymentClick: (amount: number) => void;
  onPaymentPlanClick: () => void;
}

export function PatientBalanceCard({
  patientId,
  encounterId,
  estimatedVisitCost = 0,
  onPaymentClick,
  onPaymentPlanClick,
}: PatientBalanceCardProps) {
  const [balance, setBalance] = useState<PatientBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBalance();
  }, [patientId]);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/collections/patient/${patientId}/balance`);
      setBalance(response.data);
    } catch (err) {
      console.error("Error fetching patient balance:", err);
      setError("Failed to load patient balance");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!balance) return null;

  const totalToCollectToday = balance.totalBalance + estimatedVisitCost;
  const hasOldBalance = balance.totalBalance > 0;
  const isOverdue = balance.balanceOver90 > 0;

  // Calculate age category for styling
  const getAgeCategory = () => {
    if (balance.balanceOver90 > 0) return "critical";
    if (balance.balance61_90 > 0) return "warning";
    if (balance.balance31_60 > 0) return "caution";
    return "normal";
  };

  const ageCategory = getAgeCategory();

  return (
    <div className="bg-white rounded-lg shadow-lg border-2 border-blue-500 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <h3 className="text-xl font-semibold">Patient Payment</h3>
          </div>
          {hasOldBalance && (
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                ageCategory === "critical"
                  ? "bg-red-500"
                  : ageCategory === "warning"
                  ? "bg-orange-500"
                  : ageCategory === "caution"
                  ? "bg-yellow-500"
                  : "bg-green-500"
              }`}
            >
              {balance.oldestChargeDate
                ? `${Math.floor(
                    (Date.now() - new Date(balance.oldestChargeDate).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )} days old`
                : "Outstanding balance"}
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Today's Visit */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-gray-600 mb-2">Today's Visit</div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Estimated Cost:</span>
                <span className="font-semibold">
                  ${estimatedVisitCost.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Outstanding Balance */}
          <div
            className={`rounded-lg p-4 border ${
              hasOldBalance
                ? ageCategory === "critical"
                  ? "bg-red-50 border-red-300"
                  : ageCategory === "warning"
                  ? "bg-orange-50 border-orange-300"
                  : ageCategory === "caution"
                  ? "bg-yellow-50 border-yellow-300"
                  : "bg-gray-50 border-gray-300"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="text-sm text-gray-600 mb-2">Outstanding Balance</div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Previous:</span>
                <span
                  className={`font-semibold ${
                    hasOldBalance ? "text-red-600" : ""
                  }`}
                >
                  ${balance.totalBalance.toFixed(2)}
                </span>
              </div>
              {balance.oldestChargeDate && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Age:{" "}
                    {Math.floor(
                      (Date.now() - new Date(balance.oldestChargeDate).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    days
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aging Breakdown - Only show if there's a balance */}
        {hasOldBalance && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-sm font-semibold mb-3">Balance Aging</div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="text-gray-600">Current</div>
                <div className="font-semibold">
                  ${balance.currentBalance.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">31-60</div>
                <div className="font-semibold text-yellow-600">
                  ${balance.balance31_60.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">61-90</div>
                <div className="font-semibold text-orange-600">
                  ${balance.balance61_90.toFixed(2)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-600">90+</div>
                <div className="font-semibold text-red-600">
                  ${balance.balanceOver90.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Total to Collect Today */}
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border-2 border-green-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-green-700" />
              <span className="text-lg font-semibold text-green-900">
                COLLECT TODAY:
              </span>
            </div>
            <span className="text-3xl font-bold text-green-700">
              ${totalToCollectToday.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Payment Method:
          </label>
          <div className="grid grid-cols-4 gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-500 transition-colors">
              Card
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-500 transition-colors">
              Cash
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-500 transition-colors">
              Check
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-500 transition-colors">
              HSA/FSA
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <button
            onClick={() => onPaymentClick(totalToCollectToday)}
            className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors"
          >
            Collect Full ${totalToCollectToday.toFixed(2)}
          </button>
          {estimatedVisitCost > 0 && (
            <button
              onClick={() => onPaymentClick(estimatedVisitCost)}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
            >
              Today Only ${estimatedVisitCost.toFixed(2)}
            </button>
          )}
          <button
            onClick={onPaymentPlanClick}
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-colors"
          >
            Payment Plan
          </button>
        </div>

        {/* Collection Tip */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <strong>Tip:</strong> Collecting today increases collection rate by
            73%! Likelihood drops dramatically after 90 days.
          </div>
        </div>

        {/* Talking Points - Show if balance is old */}
        {balance.talkingPoints && hasOldBalance && (
          <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-300">
            <div className="text-sm font-semibold text-yellow-900 mb-2">
              Collection Script:
            </div>
            <p className="text-sm text-yellow-800 mb-3 italic">
              "{balance.talkingPoints.script}"
            </p>
            <div className="text-xs text-yellow-700">
              <div className="font-semibold mb-1">Tips:</div>
              <ul className="list-disc list-inside space-y-1">
                {balance.talkingPoints.tips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
