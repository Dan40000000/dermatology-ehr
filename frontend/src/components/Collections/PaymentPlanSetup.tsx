import React, { useState } from "react";
import { api } from "../../api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { Calendar, DollarSign, CreditCard, Check } from "lucide-react";

interface PaymentPlanSetupProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  totalBalance: number;
  onSuccess?: (planId: string) => void;
}

export function PaymentPlanSetup({
  isOpen,
  onClose,
  patientId,
  patientName,
  totalBalance,
  onSuccess,
}: PaymentPlanSetupProps) {
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [numberOfPayments, setNumberOfPayments] = useState("6");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [autoCharge, setAutoCharge] = useState(false);
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Calculate suggested monthly payment
  const suggestedMonthlyPayment = (totalBalance / 6).toFixed(2);

  const calculatedTotal =
    parseFloat(monthlyPayment || "0") * parseInt(numberOfPayments || "0");
  const isValidPlan =
    calculatedTotal >= totalBalance && parseFloat(monthlyPayment || "0") > 0;

  const handleCreatePlan = async () => {
    try {
      setProcessing(true);
      setError(null);

      const response = await api.post("/api/collections/payment-plan", {
        patientId,
        totalAmount: totalBalance,
        monthlyPayment: parseFloat(monthlyPayment),
        numberOfPayments: parseInt(numberOfPayments),
        startDate,
        autoCharge,
        notes,
      });

      setSuccess(true);
      if (onSuccess) {
        onSuccess(response.data.id);
      }

      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error("Error creating payment plan:", err);
      setError(err.response?.data?.error || "Failed to create payment plan");
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    if (!processing) {
      setMonthlyPayment("");
      setNumberOfPayments("6");
      setStartDate(new Date().toISOString().split("T")[0]);
      setAutoCharge(false);
      setNotes("");
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Payment Plan Created!
            </h3>
            <p className="text-gray-600">
              The payment plan has been successfully set up for {patientName}.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Setup Payment Plan
          </DialogTitle>
          <DialogDescription>
            Create a manageable payment plan for {patientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Balance Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <div className="text-sm text-blue-700 mb-1">Total Balance</div>
            <div className="text-3xl font-bold text-blue-900">
              ${totalBalance.toFixed(2)}
            </div>
          </div>

          {/* Payment Plan Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Payment Amount
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={suggestedMonthlyPayment}
                />
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Suggested: ${suggestedMonthlyPayment}/month
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Payments
              </label>
              <select
                value={numberOfPayments}
                onChange={(e) => setNumberOfPayments(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="9">9 months</option>
                <option value="12">12 months</option>
                <option value="18">18 months</option>
                <option value="24">24 months</option>
              </select>
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              First Payment Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Plan Summary */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-3">
              Payment Plan Summary
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Monthly Payment:</span>
                <span className="font-semibold">
                  ${parseFloat(monthlyPayment || "0").toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Number of Payments:</span>
                <span className="font-semibold">{numberOfPayments}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total to be Paid:</span>
                <span className="font-semibold">
                  ${calculatedTotal.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-gray-300 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Current Balance:</span>
                  <span className="font-semibold">
                    ${totalBalance.toFixed(2)}
                  </span>
                </div>
                {calculatedTotal < totalBalance && (
                  <div className="flex justify-between text-red-600">
                    <span>Shortfall:</span>
                    <span className="font-semibold">
                      -${(totalBalance - calculatedTotal).toFixed(2)}
                    </span>
                  </div>
                )}
                {calculatedTotal > totalBalance && (
                  <div className="flex justify-between text-green-600">
                    <span>Overpayment:</span>
                    <span className="font-semibold">
                      +${(calculatedTotal - totalBalance).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Auto-charge Option */}
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="autoCharge"
                checked={autoCharge}
                onChange={(e) => setAutoCharge(e.target.checked)}
                className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <label
                  htmlFor="autoCharge"
                  className="font-medium text-purple-900 cursor-pointer"
                >
                  <CreditCard className="inline h-4 w-4 mr-1" />
                  Auto-charge card on file
                </label>
                <p className="text-sm text-purple-700 mt-1">
                  Automatically charge the patient's saved payment method on the
                  monthly payment date. Patient must have a valid card on file.
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Special terms, conditions, or notes about this payment plan..."
            />
          </div>

          {/* Validation Warning */}
          {!isValidPlan && monthlyPayment && (
            <Alert variant="destructive">
              <AlertDescription>
                The total payment plan amount (${calculatedTotal.toFixed(2)})
                must be at least the total balance (${totalBalance.toFixed(2)})
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Agreement */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 text-sm text-yellow-900">
            <p>
              <strong>Agreement:</strong> By creating this payment plan, the
              patient agrees to make {numberOfPayments} monthly payments of $
              {parseFloat(monthlyPayment || "0").toFixed(2)}, starting on{" "}
              {new Date(startDate).toLocaleDateString()}. Failure to make
              payments may result in account suspension and referral to
              collections.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreatePlan}
              disabled={processing || !isValidPlan}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {processing ? "Creating Plan..." : "Create Payment Plan"}
            </button>
            <button
              onClick={handleClose}
              disabled={processing}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
