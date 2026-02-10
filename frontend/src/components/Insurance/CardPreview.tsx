/**
 * CardPreview Component
 *
 * Displays scanned insurance card image with detected information overlay
 * Shows front and back of card with extracted text regions
 */

import React, { useState } from 'react';
import { CreditCard, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff } from 'lucide-react';

interface CardPreviewProps {
  frontImageUrl?: string;
  backImageUrl?: string;
  extractedData?: ExtractedData;
  showHighlights?: boolean;
  className?: string;
}

interface ExtractedData {
  memberId?: string;
  groupNumber?: string;
  payerName?: string;
  planType?: string;
  subscriberName?: string;
  effectiveDate?: string;
  copayPcp?: number;
  copaySpecialist?: number;
  copayEr?: number;
  claimsPhone?: string;
  priorAuthPhone?: string;
}

interface FieldHighlight {
  label: string;
  value: string;
  color: string;
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  frontImageUrl,
  backImageUrl,
  extractedData,
  showHighlights: initialShowHighlights = true,
  className = '',
}) => {
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [zoom, setZoom] = useState(1);
  const [showHighlights, setShowHighlights] = useState(initialShowHighlights);

  const currentImage = activeSide === 'front' ? frontImageUrl : backImageUrl;

  // Build field highlights based on extracted data
  const getFieldHighlights = (): FieldHighlight[] => {
    if (!extractedData) return [];

    const highlights: FieldHighlight[] = [];

    if (activeSide === 'front') {
      if (extractedData.payerName) {
        highlights.push({ label: 'Payer', value: extractedData.payerName, color: 'blue' });
      }
      if (extractedData.memberId) {
        highlights.push({ label: 'Member ID', value: extractedData.memberId, color: 'green' });
      }
      if (extractedData.groupNumber) {
        highlights.push({ label: 'Group', value: extractedData.groupNumber, color: 'purple' });
      }
      if (extractedData.planType) {
        highlights.push({ label: 'Plan Type', value: extractedData.planType, color: 'orange' });
      }
      if (extractedData.subscriberName) {
        highlights.push({ label: 'Subscriber', value: extractedData.subscriberName, color: 'teal' });
      }
      if (extractedData.effectiveDate) {
        highlights.push({ label: 'Effective', value: extractedData.effectiveDate, color: 'gray' });
      }
    } else {
      if (extractedData.copayPcp) {
        highlights.push({ label: 'PCP Copay', value: `$${extractedData.copayPcp}`, color: 'green' });
      }
      if (extractedData.copaySpecialist) {
        highlights.push({ label: 'Specialist', value: `$${extractedData.copaySpecialist}`, color: 'blue' });
      }
      if (extractedData.copayEr) {
        highlights.push({ label: 'ER Copay', value: `$${extractedData.copayEr}`, color: 'red' });
      }
      if (extractedData.claimsPhone) {
        highlights.push({ label: 'Claims', value: extractedData.claimsPhone, color: 'purple' });
      }
      if (extractedData.priorAuthPhone) {
        highlights.push({ label: 'Prior Auth', value: extractedData.priorAuthPhone, color: 'orange' });
      }
    }

    return highlights;
  };

  const highlights = getFieldHighlights();

  const getColorClasses = (color: string): string => {
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-800 border-blue-300',
      green: 'bg-green-100 text-green-800 border-green-300',
      purple: 'bg-purple-100 text-purple-800 border-purple-300',
      orange: 'bg-orange-100 text-orange-800 border-orange-300',
      red: 'bg-red-100 text-red-800 border-red-300',
      teal: 'bg-teal-100 text-teal-800 border-teal-300',
      gray: 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colorMap[color] || colorMap.gray;
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Insurance Card Preview</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowHighlights(!showHighlights)}
              className={`p-2 rounded-lg transition-colors ${
                showHighlights ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'
              }`}
              title={showHighlights ? 'Hide extracted fields' : 'Show extracted fields'}
            >
              {showHighlights ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-600 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(Math.min(2, zoom + 0.25))}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              title="Reset zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Side Toggle */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSide('front')}
            disabled={!frontImageUrl}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              activeSide === 'front'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            } ${!frontImageUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Front
          </button>
          <button
            onClick={() => setActiveSide('back')}
            disabled={!backImageUrl}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              activeSide === 'back'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            } ${!backImageUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Back
          </button>
        </div>
      </div>

      {/* Card Image */}
      <div className="p-4">
        {currentImage ? (
          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
            <div
              className="transition-transform duration-200 origin-center"
              style={{ transform: `scale(${zoom})` }}
            >
              <img
                src={currentImage}
                alt={`${activeSide} of insurance card`}
                className="w-full h-auto"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
            <CreditCard className="w-12 h-12 text-gray-400 mb-2" />
            <p className="text-gray-500">No {activeSide} image available</p>
          </div>
        )}
      </div>

      {/* Extracted Fields */}
      {showHighlights && highlights.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Extracted Fields</h4>
          <div className="flex flex-wrap gap-2">
            {highlights.map((highlight, index) => (
              <span
                key={index}
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getColorClasses(
                  highlight.color
                )}`}
              >
                <span className="font-medium">{highlight.label}:</span>
                <span className="ml-1">{highlight.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* No Data Message */}
      {showHighlights && highlights.length === 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500 text-center">
            No extracted data available for this side of the card.
          </p>
        </div>
      )}
    </div>
  );
};
