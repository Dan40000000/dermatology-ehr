import React, { useState, useEffect } from "react";
import { api } from "../../api";
import { Alert, AlertDescription } from "../ui/alert";
import { Calculator, DollarSign, Info, CheckCircle } from "lucide-react";

interface CostEstimate {
  estimatedTotal: number;
  breakdown: {
    totalCharges: number;
    insurancePays: number;
    patientResponsibility: number;
    copay: number;
    deductible: number;
    coinsurance: number;
  };
}

interface CostEstimatorProps {
  patientId: string;
  appointmentId?: string;
  serviceType: string;
  cptCodes?: string[];
  isCosmetic?: boolean;
  onEstimateReady?: (estimate: number) => void;
}

export function CostEstimator({
  patientId,
  appointmentId,
  serviceType,
  cptCodes = [],
  isCosmetic = false,
  onEstimateReady,
}: CostEstimatorProps) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (patientId) {
      fetchEstimate();
    }
  }, [patientId, serviceType, cptCodes, isCosmetic]);

  const fetchEstimate = async () => {
    try {
      setLoading(true);
      setError(null);

      if (cptCodes.length > 0) {
        // Full estimate with CPT codes
        const response = await api.post("/api/collections/estimate", {
          patientId,
          appointmentId,
          serviceType,
          cptCodes,
          isCosmetic,
        });
        setEstimate(response.data.estimate.breakdown);
        if (onEstimateReady) {
          onEstimateReady(response.data.estimate.patientResponsibility);
        }
      } else {
        // Quick estimate based on procedure type
        const response = await api.post("/api/collections/estimate/quick", {
          patientId,
          procedureType: serviceType,
        });
        const quickEstimate = {
          estimatedTotal: response.data.estimatedCost,
          breakdown: {
            totalCharges: response.data.range.max,
            insurancePays: response.data.range.max - response.data.estimatedCost,
            patientResponsibility: response.data.estimatedCost,
            copay: 0,
            deductible: 0,
            coinsurance: 0,
          },
        };
        setEstimate(quickEstimate);
        if (onEstimateReady) {
          onEstimateReady(response.data.estimatedCost);
        }
      }
    } catch (err: any) {
      console.error("Error fetching cost estimate:", err);
      setError("Unable to calculate cost estimate");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-16 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <Alert>
        <AlertDescription className="flex items-center gap-2">
          <Info className="h-4 w-4" />
          {error || "Cost estimate not available"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-md border-2 border-green-500 overflow-hidden">
      {/* Header */}
      <div className="bg-green-600 text-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            <h3 className="font-semibold">Estimated Cost Today</h3>
          </div>
          {isCosmetic && (
            <span className="px-2 py-1 bg-purple-500 rounded text-xs font-medium">
              Cosmetic - Patient Pay
            </span>
          )}
        </div>
      </div>

      {/* Main Amount */}
      <div className="p-6">
        <div className="text-center mb-4">
          <div className="text-sm text-green-700 mb-1">
            Your estimated cost today:
          </div>
          <div className="text-5xl font-bold text-green-900 mb-2">
            ${estimate.breakdown.patientResponsibility.toFixed(2)}
          </div>
          {!isCosmetic && (
            <div className="text-sm text-green-600">
              Based on insurance benefits and deductible status
            </div>
          )}
        </div>

        {/* Show Details Toggle */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full text-center text-sm text-green-700 hover:text-green-900 underline mb-4"
        >
          {showDetails ? "Hide" : "Show"} breakdown details
        </button>

        {/* Detailed Breakdown */}
        {showDetails && !isCosmetic && (
          <div className="bg-white rounded-lg p-4 border border-green-200 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Charges:</span>
              <span className="font-semibold">
                ${estimate.breakdown.totalCharges.toFixed(2)}
              </span>
            </div>
            {estimate.breakdown.copay > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Copay:</span>
                <span className="font-semibold">
                  ${estimate.breakdown.copay.toFixed(2)}
                </span>
              </div>
            )}
            {estimate.breakdown.deductible > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Deductible:</span>
                <span className="font-semibold">
                  ${estimate.breakdown.deductible.toFixed(2)}
                </span>
              </div>
            )}
            {estimate.breakdown.coinsurance > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Coinsurance:</span>
                <span className="font-semibold">
                  ${estimate.breakdown.coinsurance.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between text-blue-700">
                <span>Insurance Pays:</span>
                <span className="font-semibold">
                  ${estimate.breakdown.insurancePays.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-green-800 font-bold">
                <span>You Pay:</span>
                <span>${estimate.breakdown.patientResponsibility.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Notice */}
        <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200 text-xs text-blue-800">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Note:</strong> This is an estimate based on your current
              insurance benefits. Actual charges may vary. {!isCosmetic && "Final amount depends on insurance processing."}
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-4 flex items-start gap-2 p-3 bg-green-600 text-white rounded-lg text-sm">
          <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Payment encouraged!</strong> Paying your estimated cost today
            helps avoid billing delays and ensures faster processing.
          </div>
        </div>
      </div>
    </div>
  );
}
