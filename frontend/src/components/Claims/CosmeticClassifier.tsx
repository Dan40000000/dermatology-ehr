interface LineItem {
  cpt: string;
  modifiers?: string[];
  dx: string[];
  units: number;
  charge: number;
  description?: string;
}

interface CosmeticClassifierProps {
  lineItems: LineItem[];
  onClose: () => void;
}

export default function CosmeticClassifier({ lineItems, onClose }: CosmeticClassifierProps) {
  const cosmeticProcedures: { [key: string]: { name: string; medicalIndicators: string[]; patientCost: string } } = {
    'J0585': {
      name: 'Botox Injection',
      medicalIndicators: [
        'Hyperhidrosis (excessive sweating) - R61',
        'Chronic migraine - G43.7',
        'Blepharospasm - G24.5',
        'Cervical dystonia - G24.3',
      ],
      patientCost: '$350-$600 per session',
    },
    '15780': {
      name: 'Dermabrasion (total face)',
      medicalIndicators: [
        'Acne scarring documented with photos',
        'Precancerous lesions - D04',
        'Post-surgical scars affecting function',
      ],
      patientCost: '$1,500-$4,000',
    },
    '15781': {
      name: 'Dermabrasion (segmental)',
      medicalIndicators: [
        'Acne scarring in specific area',
        'Keloid scar tissue',
        'Post-traumatic scarring',
      ],
      patientCost: '$500-$2,000',
    },
    '17999': {
      name: 'Laser resurfacing/treatment',
      medicalIndicators: [
        'Port wine stain - Q82.5',
        'Hemangioma - D18.0',
        'Actinic keratosis - L57.0',
        'Warts resistant to other treatment',
      ],
      patientCost: '$200-$1,500 per session',
    },
  };

  const checkCosmetic = (cpt: string) => {
    return cpt in cosmeticProcedures;
  };

  const potentialCosmeticItems = lineItems.filter(item => checkCosmetic(item.cpt));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Cosmetic vs. Medical Classification</h2>
              <p className="text-sm text-gray-600 mt-1">Determine if procedures should be billed to insurance</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {potentialCosmeticItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-4xl mb-2">✅</div>
              <p className="text-gray-600">No potentially cosmetic procedures detected in this claim.</p>
              <p className="text-sm text-gray-500 mt-2">All procedures appear appropriate for insurance billing.</p>
            </div>
          ) : (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <span className="text-yellow-600 text-xl">⚠️</span>
                  <div>
                    <h3 className="font-semibold text-yellow-900">Potential Cosmetic Procedures Detected</h3>
                    <p className="text-sm text-yellow-800 mt-1">
                      The following procedures can be cosmetic or medical depending on documentation.
                      Verify medical necessity before billing to insurance.
                    </p>
                  </div>
                </div>
              </div>

              {potentialCosmeticItems.map((item, idx) => {
                const info = cosmeticProcedures[item.cpt];
                return (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.cpt} - {info.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        This procedure can be billed as <strong>Medical</strong> or <strong>Cosmetic</strong>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Medical */}
                      <div className="border border-green-200 rounded-lg p-3 bg-green-50">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-green-600">✅</span>
                          <h4 className="font-semibold text-green-900">Bill as Medical</h4>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">Required documentation:</p>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {info.medicalIndicators.map((indicator, i) => (
                            <li key={i} className="flex items-start">
                              <span className="mr-1">•</span>
                              <span>{indicator}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-gray-600 mt-2">
                          Must have supporting documentation in chart
                        </p>
                      </div>

                      {/* Cosmetic */}
                      <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-blue-600">💰</span>
                          <h4 className="font-semibold text-blue-900">Bill as Cosmetic</h4>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">Patient responsibility:</p>
                        <div className="text-lg font-bold text-blue-900">{info.patientCost}</div>
                        <p className="text-xs text-gray-600 mt-2">
                          No insurance claim - patient pays directly
                        </p>
                        <div className="mt-2 p-2 bg-blue-100 rounded text-xs text-blue-900">
                          Ensure ABN (Advance Beneficiary Notice) is signed
                        </div>
                      </div>
                    </div>

                    {/* Current DX codes */}
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-700">
                        Current diagnosis codes: <span className="font-normal">{item.dx.join(', ') || 'None'}</span>
                      </p>
                      {item.dx.length === 0 && (
                        <p className="text-xs text-red-600 mt-1">⚠️ No diagnosis codes - add appropriate DX to support medical necessity</p>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Guidelines */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Billing Guidelines</h4>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li className="flex items-start">
                    <span className="mr-2">1.</span>
                    <span>Review medical record for documented medical necessity</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">2.</span>
                    <span>If medical: Ensure appropriate diagnosis codes are linked</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">3.</span>
                    <span>If cosmetic: Mark claim as patient responsibility and collect payment</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">4.</span>
                    <span>When in doubt, consult with provider before submitting to insurance</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
