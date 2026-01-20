import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import {
  AlertTriangle,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface CollectionPromptProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  balance: {
    totalBalance: number;
    currentBalance: number;
    balance31_60: number;
    balance61_90: number;
    balanceOver90: number;
    oldestChargeDate: string | null;
  };
  talkingPoints?: {
    script: string;
    tips: string[];
  };
  onCollectFull: () => void;
  onCollectPartial: (amount: number) => void;
  onPaymentPlan: () => void;
  onSkip: (reason: string) => void;
}

export function CollectionPrompt({
  isOpen,
  onClose,
  patientName,
  balance,
  talkingPoints,
  onCollectFull,
  onCollectPartial,
  onPaymentPlan,
  onSkip,
}: CollectionPromptProps) {
  const [skipReason, setSkipReason] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [showSkipForm, setShowSkipForm] = useState(false);
  const [showPartialForm, setShowPartialForm] = useState(false);

  const ageInDays = balance.oldestChargeDate
    ? Math.floor(
        (Date.now() - new Date(balance.oldestChargeDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  const getUrgencyLevel = () => {
    if (balance.balanceOver90 > 0) return "critical";
    if (balance.balance61_90 > 0) return "high";
    if (balance.balance31_60 > 0) return "medium";
    return "normal";
  };

  const urgencyLevel = getUrgencyLevel();

  const urgencyConfig = {
    critical: {
      color: "red",
      bgColor: "bg-red-50",
      borderColor: "border-red-500",
      textColor: "text-red-900",
      icon: <AlertTriangle className="h-8 w-8 text-red-600" />,
      message: "CRITICAL: Balance over 90 days old",
    },
    high: {
      color: "orange",
      bgColor: "bg-orange-50",
      borderColor: "border-orange-500",
      textColor: "text-orange-900",
      icon: <AlertTriangle className="h-8 w-8 text-orange-600" />,
      message: "WARNING: Balance 61-90 days old",
    },
    medium: {
      color: "yellow",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-500",
      textColor: "text-yellow-900",
      icon: <AlertTriangle className="h-8 w-8 text-yellow-600" />,
      message: "NOTICE: Balance 31-60 days old",
    },
    normal: {
      color: "blue",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-500",
      textColor: "text-blue-900",
      icon: <DollarSign className="h-8 w-8 text-blue-600" />,
      message: "Outstanding balance",
    },
  };

  const config = urgencyConfig[urgencyLevel];

  const handleSkip = () => {
    if (skipReason.trim()) {
      onSkip(skipReason);
      setShowSkipForm(false);
      setSkipReason("");
      onClose();
    }
  };

  const handlePartialPayment = () => {
    const amount = parseFloat(partialAmount);
    if (amount > 0 && amount <= balance.totalBalance) {
      onCollectPartial(amount);
      setShowPartialForm(false);
      setPartialAmount("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {config.icon}
            <span>Patient Has Outstanding Balance</span>
          </DialogTitle>
          <DialogDescription>
            {patientName} has a balance that needs attention
          </DialogDescription>
        </DialogHeader>

        {/* Urgency Alert */}
        <Alert className={`${config.bgColor} ${config.borderColor} border-2`}>
          <AlertDescription className={`${config.textColor} font-semibold`}>
            {config.message}
          </AlertDescription>
        </Alert>

        {/* Balance Summary */}
        <div className="bg-white rounded-lg border-2 border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-gray-600">Outstanding Balance</div>
              <div className="text-3xl font-bold text-gray-900">
                ${balance.totalBalance.toFixed(2)}
              </div>
            </div>
            {balance.oldestChargeDate && (
              <div className="text-right">
                <div className="text-sm text-gray-600">Age</div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-gray-500" />
                  <span className="text-xl font-semibold">{ageInDays} days</span>
                </div>
              </div>
            )}
          </div>

          {/* Aging Breakdown */}
          <div className="grid grid-cols-4 gap-2 text-sm">
            <div className="text-center p-2 bg-green-50 rounded border border-green-200">
              <div className="text-xs text-gray-600">Current</div>
              <div className="font-semibold">
                ${balance.currentBalance.toFixed(2)}
              </div>
            </div>
            <div className="text-center p-2 bg-yellow-50 rounded border border-yellow-200">
              <div className="text-xs text-gray-600">31-60 days</div>
              <div className="font-semibold text-yellow-700">
                ${balance.balance31_60.toFixed(2)}
              </div>
            </div>
            <div className="text-center p-2 bg-orange-50 rounded border border-orange-200">
              <div className="text-xs text-gray-600">61-90 days</div>
              <div className="font-semibold text-orange-700">
                ${balance.balance61_90.toFixed(2)}
              </div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded border border-red-200">
              <div className="text-xs text-gray-600">90+ days</div>
              <div className="font-semibold text-red-700">
                ${balance.balanceOver90.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Collection Script */}
        {talkingPoints && (
          <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
            <div className="text-sm font-semibold text-purple-900 mb-2">
              Suggested Script:
            </div>
            <p className="text-sm text-purple-800 italic mb-3">
              "{talkingPoints.script.replace("[Patient Name]", patientName)}"
            </p>
            <div className="text-xs text-purple-700">
              <div className="font-semibold mb-1">Tips:</div>
              <ul className="list-disc list-inside space-y-1">
                {talkingPoints.tips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Partial Payment Form */}
        {showPartialForm && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Partial Payment Amount:
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={balance.totalBalance}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <button
                onClick={handlePartialPayment}
                disabled={!partialAmount || parseFloat(partialAmount) <= 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Collect
              </button>
              <button
                onClick={() => {
                  setShowPartialForm(false);
                  setPartialAmount("");
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Skip Form */}
        {showSkipForm && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Skipping Collection: (Required)
            </label>
            <div className="space-y-2">
              <select
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select reason...</option>
                <option value="Patient will pay online">
                  Patient will pay online
                </option>
                <option value="Patient disputes charges">
                  Patient disputes charges
                </option>
                <option value="Waiting for insurance">
                  Waiting for insurance
                </option>
                <option value="Financial hardship">Financial hardship</option>
                <option value="Payment plan already exists">
                  Payment plan already exists
                </option>
                <option value="Manager approval needed">
                  Manager approval needed
                </option>
                <option value="Other">Other</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleSkip}
                  disabled={!skipReason}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Confirm Skip
                </button>
                <button
                  onClick={() => {
                    setShowSkipForm(false);
                    setSkipReason("");
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!showPartialForm && !showSkipForm && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                onCollectFull();
                onClose();
              }}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-colors"
            >
              <CheckCircle className="h-5 w-5" />
              Collect Full Amount
            </button>
            <button
              onClick={() => setShowPartialForm(true)}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
            >
              Collect Partial
            </button>
            <button
              onClick={() => {
                onPaymentPlan();
                onClose();
              }}
              className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-colors"
            >
              Setup Payment Plan
            </button>
            <button
              onClick={() => setShowSkipForm(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-semibold transition-colors"
            >
              <XCircle className="h-5 w-5" />
              Skip (with reason)
            </button>
          </div>
        )}

        {/* Warning for Critical Balances */}
        {urgencyLevel === "critical" && !showSkipForm && (
          <Alert variant="destructive">
            <AlertDescription>
              <strong>Policy Reminder:</strong> Balances over 90 days require
              payment or payment plan before service. Manager approval may be
              required to proceed.
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
