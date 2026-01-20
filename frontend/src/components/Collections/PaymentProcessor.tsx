import React, { useState } from "react";
import { api } from "../../api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { CreditCard, DollarSign, Check, Printer } from "lucide-react";

interface PaymentProcessorProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  amount: number;
  encounterId?: string;
  collectionPoint?: string;
  onSuccess?: (paymentId: string, receiptNumber: string) => void;
}

export function PaymentProcessor({
  isOpen,
  onClose,
  patientId,
  patientName,
  amount: initialAmount,
  encounterId,
  collectionPoint = "check_in",
  onSuccess,
}: PaymentProcessorProps) {
  const [amount, setAmount] = useState(initialAmount.toString());
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "cash" | "check" | "hsa"
  >("card");
  const [cardLastFour, setCardLastFour] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [splitPayments, setSplitPayments] = useState<
    Array<{ method: string; amount: number }>
  >([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");

  const handleProcessPayment = async () => {
    try {
      setProcessing(true);
      setError(null);

      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        setError("Please enter a valid amount");
        return;
      }

      const response = await api.post("/api/collections/payment", {
        patientId,
        amount: paymentAmount,
        paymentMethod,
        cardLastFour: paymentMethod === "card" ? cardLastFour : undefined,
        checkNumber: paymentMethod === "check" ? checkNumber : undefined,
        referenceNumber,
        encounterId,
        collectionPoint,
        notes,
      });

      setReceiptNumber(response.data.receiptNumber);
      setSuccess(true);

      if (onSuccess) {
        onSuccess(response.data.paymentId, response.data.receiptNumber);
      }
    } catch (err: any) {
      console.error("Error processing payment:", err);
      setError(err.response?.data?.error || "Failed to process payment");
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintReceipt = () => {
    // In production, this would print a formatted receipt
    window.print();
  };

  const handleClose = () => {
    if (!processing) {
      setAmount(initialAmount.toString());
      setPaymentMethod("card");
      setCardLastFour("");
      setCheckNumber("");
      setReferenceNumber("");
      setNotes("");
      setError(null);
      setSuccess(false);
      setReceiptNumber("");
      onClose();
    }
  };

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-6 w-6" />
              Payment Successful
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-green-700 mb-2">
                ${parseFloat(amount).toFixed(2)}
              </div>
              <div className="text-sm text-green-600">Payment Received</div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-600">Patient:</div>
                <div className="font-semibold">{patientName}</div>
                <div className="text-gray-600">Receipt #:</div>
                <div className="font-semibold">{receiptNumber}</div>
                <div className="text-gray-600">Method:</div>
                <div className="font-semibold capitalize">{paymentMethod}</div>
                <div className="text-gray-600">Date:</div>
                <div className="font-semibold">
                  {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Process Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-600">Patient:</div>
            <div className="font-semibold">{patientName}</div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500">$</span>
              </div>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(["card", "cash", "check", "hsa"] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`px-4 py-3 border-2 rounded-lg font-medium transition-colors ${
                    paymentMethod === method
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {method === "card" && <CreditCard className="h-5 w-5 mx-auto mb-1" />}
                  <div className="text-sm capitalize">{method}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Card Details */}
          {paymentMethod === "card" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Card Last 4 Digits (Optional)
              </label>
              <input
                type="text"
                maxLength={4}
                value={cardLastFour}
                onChange={(e) => setCardLastFour(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Check Number */}
          {paymentMethod === "check" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check Number
              </label>
              <input
                type="text"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder="Check #"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reference Number (Optional)
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Transaction ID, authorization code, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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
              placeholder="Additional notes..."
            />
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleProcessPayment}
              disabled={processing || !amount || parseFloat(amount) <= 0}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              {processing ? "Processing..." : `Process $${parseFloat(amount || "0").toFixed(2)}`}
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
