import React, { useState } from "react";
import { api } from "../../api";
import { Alert, AlertDescription } from "../ui/alert";
import { FileText, Mail, Printer, Download, CheckCircle } from "lucide-react";

interface StatementGeneratorProps {
  patientId: string;
  patientName: string;
  balance: {
    totalBalance: number;
    currentBalance: number;
    balance31_60: number;
    balance61_90: number;
    balanceOver90: number;
  };
  onSuccess?: () => void;
}

export function StatementGenerator({
  patientId,
  patientName,
  balance,
  onSuccess,
}: StatementGeneratorProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<"mail" | "email" | "both">(
    "email"
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [statementNumber, setStatementNumber] = useState("");

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);

      const response = await api.post(`/api/collections/statement/${patientId}`, {
        deliveryMethod,
      });

      setStatementNumber(response.data.statementNumber);
      setSuccess(true);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error("Error generating statement:", err);
      setError(err.response?.data?.error || "Failed to generate statement");
    } finally {
      setGenerating(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Statement Generated!
          </h3>
          <p className="text-gray-600 mb-4">
            Statement {statementNumber} has been created for {patientName}
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={() => setSuccess(false)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Generate Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h3 className="text-lg font-semibold">Generate Patient Statement</h3>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Patient Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Patient:</div>
          <div className="font-semibold text-gray-900">{patientName}</div>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-blue-700 mb-1">Total Balance</div>
            <div className="text-2xl font-bold text-blue-900">
              ${balance.totalBalance.toFixed(2)}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Aging Breakdown</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Current:</span>
                <span className="font-semibold">
                  ${balance.currentBalance.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">31-60:</span>
                <span className="font-semibold text-yellow-600">
                  ${balance.balance31_60.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">61-90:</span>
                <span className="font-semibold text-orange-600">
                  ${balance.balance61_90.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">90+:</span>
                <span className="font-semibold text-red-600">
                  ${balance.balanceOver90.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Statement Content Preview */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-700 mb-3">
            Statement Will Include:
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
              Clear breakdown of all charges
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
              Insurance payments shown
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
              Patient responsibility highlighted
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
              Payment options and instructions
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
              Due date (30 days from statement date)
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
              Contact information for questions
            </li>
          </ul>
        </div>

        {/* Delivery Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Delivery Method
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setDeliveryMethod("email")}
              className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-colors ${
                deliveryMethod === "email"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Mail className="h-6 w-6" />
              <span className="text-sm font-medium">Email</span>
            </button>

            <button
              onClick={() => setDeliveryMethod("mail")}
              className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-colors ${
                deliveryMethod === "mail"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Printer className="h-6 w-6" />
              <span className="text-sm font-medium">Print/Mail</span>
            </button>

            <button
              onClick={() => setDeliveryMethod("both")}
              className={`flex flex-col items-center gap-2 p-4 border-2 rounded-lg transition-colors ${
                deliveryMethod === "both"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="flex gap-1">
                <Mail className="h-5 w-5" />
                <Printer className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Both</span>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              Generating...
            </>
          ) : (
            <>
              <FileText className="h-5 w-5" />
              Generate Statement
            </>
          )}
        </button>

        {/* Info */}
        <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200 text-sm text-yellow-800">
          <strong>Note:</strong> Statement will be dated today with a due date 30
          days from now. The statement will be marked as sent once generated.
        </div>
      </div>
    </div>
  );
}
