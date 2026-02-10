/**
 * CopayPrompt Component
 *
 * Modal displayed at check-in to prompt staff for copay collection.
 * Shows expected copay amount, patient balance, and collection options.
 */

import React, { useState, useEffect } from "react";
import { api } from "../../api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import {
  DollarSign,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Wallet,
  Calendar,
} from "lucide-react";

interface CopayPromptProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId: string;
  patientName: string;
  onPaymentSuccess?: (receiptNumber: string) => void;
  onPaymentPlan?: () => void;
}

interface CopayInfo {
  copayAmount: number;
  copayAmountCents: number;
  source: "eligibility_check" | "manual" | "default" | "payer_contract";
  visitType: string;
  payer: {
    id: string | null;
    name: string | null;
  };
  patientBalance: number;
  totalDue: number;
}

interface CardOnFile {
  id: string;
  lastFour: string;
  cardType: string;
  displayName: string;
  isDefault: boolean;
}

type PaymentMethod = "cash" | "check" | "credit_card" | "debit_card" | "hsa_fsa" | "card_on_file";

const SKIP_REASONS = [
  { value: "patient_refused", label: "Patient refused to pay" },
  { value: "no_card_available", label: "No card available" },
  { value: "dispute", label: "Patient disputes charges" },
  { value: "hardship", label: "Financial hardship" },
  { value: "insurance_issue", label: "Insurance issue - needs verification" },
  { value: "will_pay_later", label: "Will pay at checkout" },
  { value: "manager_override", label: "Manager approved skip" },
  { value: "other", label: "Other reason" },
] as const;

export function CopayPrompt({
  isOpen,
  onClose,
  appointmentId,
  patientId,
  patientName,
  onPaymentSuccess,
  onPaymentPlan,
}: CopayPromptProps) {
  const [copayInfo, setCopayInfo] = useState<CopayInfo | null>(null);
  const [cards, setCards] = useState<CardOnFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credit_card");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [showSkipForm, setShowSkipForm] = useState(false);
  const [skipReason, setSkipReason] = useState<string>("");
  const [skipNotes, setSkipNotes] = useState<string>("");

  // Load copay info and cards on file
  useEffect(() => {
    if (isOpen && appointmentId) {
      loadCopayInfo();
      loadCardsOnFile();
    }
  }, [isOpen, appointmentId, patientId]);

  const loadCopayInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/collections/appointment/${appointmentId}/due`);
      setCopayInfo(response.data);
      setPaymentAmount(response.data.copayAmount.toFixed(2));
    } catch (err: unknown) {
      console.error("Error loading copay info:", err);
      setError("Failed to load copay information");
    } finally {
      setLoading(false);
    }
  };

  const loadCardsOnFile = async () => {
    try {
      const response = await api.get(`/api/collections/patient/${patientId}/cards`);
      setCards(response.data.cards || []);
      const defaultCard = response.data.cards?.find((c: CardOnFile) => c.isDefault);
      if (defaultCard) {
        setSelectedCardId(defaultCard.id);
      }
    } catch (err) {
      console.error("Error loading cards:", err);
    }
  };

  const handlePayment = async () => {
    if (!copayInfo) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const payload = {
        appointmentId,
        patientId,
        amountCents: Math.round(amount * 100),
        method: paymentMethod,
        referenceNumber: referenceNumber || undefined,
        promptType: "copay" as const,
        collectionPoint: "check_in" as const,
      };

      const response = await api.post("/api/collections/copay-payment", payload);

      if (response.data.success && onPaymentSuccess) {
        onPaymentSuccess(response.data.receiptNumber);
      }

      handleClose();
    } catch (err: unknown) {
      console.error("Error processing payment:", err);
      const message = err instanceof Error ? err.message : "Failed to process payment";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleChargeCard = async () => {
    if (!copayInfo || !selectedCardId) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const chargeResponse = await api.post("/api/collections/charge-card", {
        patientId,
        amountCents: Math.round(amount * 100),
        description: "Copay payment",
        cardId: selectedCardId,
      });

      if (!chargeResponse.data.success) {
        setError(chargeResponse.data.error || "Card charge failed");
        return;
      }

      // Record the payment
      const paymentResponse = await api.post("/api/collections/copay-payment", {
        appointmentId,
        patientId,
        amountCents: Math.round(amount * 100),
        method: "card_on_file",
        referenceNumber: chargeResponse.data.transactionId,
        promptType: "copay" as const,
        collectionPoint: "check_in" as const,
      });

      if (paymentResponse.data.success && onPaymentSuccess) {
        onPaymentSuccess(paymentResponse.data.receiptNumber);
      }

      handleClose();
    } catch (err: unknown) {
      console.error("Error charging card:", err);
      const message = err instanceof Error ? err.message : "Failed to charge card";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSkip = async () => {
    if (!skipReason) {
      setError("Please select a reason for skipping");
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      // First create a prompt if one doesn't exist
      const promptResponse = await api.post("/api/collections/prompt", {
        appointmentId,
        patientId,
        promptType: "copay",
        amountCents: copayInfo?.copayAmountCents || 0,
        collectionPoint: "check_in",
      });

      // Then skip it
      await api.post(`/api/collections/prompt/${promptResponse.data.id}/skip`, {
        reason: skipReason,
        notes: skipNotes || undefined,
      });

      handleClose();
    } catch (err: unknown) {
      console.error("Error skipping collection:", err);
      const message = err instanceof Error ? err.message : "Failed to skip collection";
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setCopayInfo(null);
    setCards([]);
    setPaymentAmount("");
    setReferenceNumber("");
    setShowSkipForm(false);
    setSkipReason("");
    setSkipNotes("");
    setError(null);
    setLoading(true);
    onClose();
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "eligibility_check":
        return "From eligibility verification";
      case "payer_contract":
        return "From payer contract";
      case "manual":
        return "Manually set";
      default:
        return "Default amount";
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-600" />
            Copay Collection - Check-In
          </DialogTitle>
          <DialogDescription>
            Collect payment for {patientName}&apos;s visit
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Copay Amount */}
            {copayInfo && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-green-700 flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Expected Copay
                    </div>
                    <div className="text-3xl font-bold text-green-800">
                      ${copayInfo.copayAmount.toFixed(2)}
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      {getSourceLabel(copayInfo.source)}
                      {copayInfo.payer.name && ` - ${copayInfo.payer.name}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Visit Type</div>
                    <div className="text-lg font-semibold capitalize">
                      {copayInfo.visitType.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>

                {/* Outstanding Balance */}
                {copayInfo.patientBalance > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        Outstanding Balance
                      </span>
                      <span className="font-semibold text-amber-800">
                        ${copayInfo.patientBalance.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1 font-bold">
                      <span>Total Due Today</span>
                      <span className="text-lg">${copayInfo.totalDue.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Skip Form */}
            {showSkipForm ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Skipping *
                  </label>
                  <select
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select reason...</option>
                    {SKIP_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={skipNotes}
                    onChange={(e) => setSkipNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional details..."
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSkip}
                    disabled={!skipReason || processing}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
                  >
                    {processing ? "Processing..." : "Confirm Skip"}
                  </button>
                  <button
                    onClick={() => setShowSkipForm(false)}
                    disabled={processing}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Payment Amount */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500">$</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="pl-7 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "credit_card", label: "Credit Card", icon: CreditCard },
                      { value: "debit_card", label: "Debit Card", icon: CreditCard },
                      { value: "cash", label: "Cash", icon: DollarSign },
                      { value: "check", label: "Check", icon: Wallet },
                      { value: "hsa_fsa", label: "HSA/FSA", icon: Wallet },
                    ].map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => setPaymentMethod(method.value as PaymentMethod)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors ${
                          paymentMethod === method.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        <method.icon className="h-4 w-4" />
                        <span className="text-sm">{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card on File Section */}
                {cards.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <div className="text-sm font-medium text-blue-800 mb-2">
                      Card on File Available
                    </div>
                    <div className="space-y-2">
                      {cards.map((card) => (
                        <label
                          key={card.id}
                          className={`flex items-center gap-3 p-2 rounded-md cursor-pointer ${
                            selectedCardId === card.id
                              ? "bg-blue-100 border border-blue-300"
                              : "hover:bg-blue-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name="card"
                            checked={selectedCardId === card.id}
                            onChange={() => setSelectedCardId(card.id)}
                            className="text-blue-600"
                          />
                          <CreditCard className="h-4 w-4 text-blue-600" />
                          <span className="text-sm">{card.displayName}</span>
                          {card.isDefault && (
                            <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={handleChargeCard}
                      disabled={!selectedCardId || processing}
                      className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
                    >
                      <CreditCard className="inline h-4 w-4 mr-2" />
                      Charge Card on File
                    </button>
                  </div>
                )}

                {/* Reference Number for Check/Card */}
                {(paymentMethod === "check" || paymentMethod === "credit_card" || paymentMethod === "debit_card") && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {paymentMethod === "check" ? "Check Number" : "Last 4 Digits / Reference"}
                    </label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={paymentMethod === "check" ? "Check #1234" : "1234"}
                    />
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handlePayment}
                    disabled={processing || !paymentAmount}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
                  >
                    <CheckCircle className="h-5 w-5" />
                    {processing ? "Processing..." : "Collect Payment"}
                  </button>
                  <button
                    onClick={() => {
                      if (onPaymentPlan) onPaymentPlan();
                      handleClose();
                    }}
                    disabled={processing}
                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold transition-colors"
                  >
                    <Calendar className="inline h-5 w-5 mr-1" />
                    Payment Plan
                  </button>
                </div>

                <button
                  onClick={() => setShowSkipForm(true)}
                  disabled={processing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  Skip Collection (with reason)
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default CopayPrompt;
