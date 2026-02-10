interface DoseRecommendation {
  recommendedDose: number;
  previousDose: number;
  adjustmentReason: string;
  incrementPercent: number;
  maxDose: number;
  warnings: string[];
  isMaxDose: boolean;
}

interface DoseCalculatorProps {
  nextDose: DoseRecommendation;
}

export function DoseCalculator({ nextDose }: DoseCalculatorProps) {
  const hasWarnings = nextDose.warnings && nextDose.warnings.length > 0;

  return (
    <div className={`rounded-lg p-4 ${
      hasWarnings ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
    }`}>
      <h3 className="font-medium text-gray-900 mb-3">Next Dose Recommendation</h3>

      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-sm text-gray-500">Recommended</div>
          <div className={`text-2xl font-bold ${hasWarnings ? 'text-yellow-700' : 'text-green-700'}`}>
            {nextDose.recommendedDose}
          </div>
          <div className="text-xs text-gray-500">mJ/cm2</div>
        </div>

        <div className="text-center">
          <div className="text-sm text-gray-500">Previous</div>
          <div className="text-xl font-semibold text-gray-700">
            {nextDose.previousDose || 'N/A'}
          </div>
          <div className="text-xs text-gray-500">mJ/cm2</div>
        </div>

        <div className="text-center">
          <div className="text-sm text-gray-500">Increment</div>
          <div className="text-xl font-semibold text-gray-700">
            {nextDose.incrementPercent}%
          </div>
          <div className="text-xs text-gray-500">per treatment</div>
        </div>

        <div className="text-center">
          <div className="text-sm text-gray-500">Max Dose</div>
          <div className="text-xl font-semibold text-gray-700">
            {nextDose.maxDose}
          </div>
          <div className="text-xs text-gray-500">mJ/cm2</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          <span className="font-medium">Reason:</span> {nextDose.adjustmentReason}
        </p>
      </div>

      {nextDose.isMaxDose && (
        <div className="mt-2 flex items-center gap-2 text-sm text-orange-600">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Maximum protocol dose reached
        </div>
      )}

      {hasWarnings && (
        <div className="mt-2 space-y-1">
          {nextDose.warnings.map((warning, index) => (
            <div key={index} className="flex items-center gap-2 text-sm text-yellow-700">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {warning}
            </div>
          ))}
        </div>
      )}

      {/* Dose adjustment guide */}
      <div className="mt-4 p-3 bg-white rounded border border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Erythema-Based Dose Adjustments</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-400"></span>
            <span>None/Minimal: Normal increment</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
            <span>Mild: Hold dose</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-400"></span>
            <span>Moderate: Reduce 10%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-400"></span>
            <span>Severe: Reduce 25%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
