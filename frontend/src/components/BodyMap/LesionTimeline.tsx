import React, { useEffect, useState } from 'react';
import {
  Clock,
  Camera,
  TestTube,
  Ruler,
  FileText,
  AlertCircle,
  CheckCircle,
  Activity
} from 'lucide-react';

export interface TimelineEvent {
  event_date: string;
  event_type: string;
  event_description: string;
  event_details: any;
  provider_name: string | null;
  related_id: string;
}

interface LesionTimelineProps {
  lesionId: string;
  patientId: string;
}

export function LesionTimeline({ lesionId, patientId }: LesionTimelineProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimeline();
  }, [lesionId]);

  const fetchTimeline = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/lesions/${lesionId}/timeline`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch timeline');
      }

      const data = await response.json();
      setTimeline(data.timeline || []);
    } catch (err: any) {
      console.error('Error fetching timeline:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    const iconProps = { className: 'w-5 h-5' };

    switch (eventType) {
      case 'lesion_created':
        return <Activity {...iconProps} />;
      case 'photo_captured':
        return <Camera {...iconProps} />;
      case 'biopsy_ordered':
      case 'biopsy_resulted':
        return <TestTube {...iconProps} />;
      case 'measurement':
        return <Ruler {...iconProps} />;
      case 'status_change':
        return <AlertCircle {...iconProps} />;
      default:
        return <FileText {...iconProps} />;
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'lesion_created':
        return { bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-700' };
      case 'photo_captured':
        return { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-700' };
      case 'biopsy_ordered':
        return { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-700' };
      case 'biopsy_resulted':
        return { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' };
      case 'measurement':
        return { bg: 'bg-indigo-100', border: 'border-indigo-500', text: 'text-indigo-700' };
      case 'status_change':
        return { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-700' };
      default:
        return { bg: 'bg-gray-100', border: 'border-gray-500', text: 'text-gray-700' };
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const renderEventDetails = (event: TimelineEvent) => {
    const details = event.event_details || {};

    switch (event.event_type) {
      case 'lesion_created':
        return (
          <div className="text-sm text-gray-600 mt-1 space-y-1">
            <div>Location: <span className="font-medium">{details.location}</span></div>
            {details.type && <div>Type: <span className="font-medium">{details.type}</span></div>}
            {details.concern_level && (
              <div>
                Concern Level:
                <span className={`ml-1 px-2 py-0.5 rounded text-xs font-medium ${
                  details.concern_level === 'critical' ? 'bg-red-100 text-red-700' :
                  details.concern_level === 'high' ? 'bg-orange-100 text-orange-700' :
                  details.concern_level === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {details.concern_level}
                </span>
              </div>
            )}
          </div>
        );

      case 'measurement':
        return (
          <div className="text-sm text-gray-600 mt-1">
            {details.length_mm && details.width_mm && (
              <div>Size: <span className="font-medium">{details.length_mm} × {details.width_mm} mm</span></div>
            )}
            {details.abcde_score && (
              <div className="mt-1">
                ABCDE Score: <span className="font-medium">{details.abcde_score.totalScore || 0}/10</span>
              </div>
            )}
          </div>
        );

      case 'biopsy_ordered':
        return (
          <div className="text-sm text-gray-600 mt-1 space-y-1">
            <div>
              Specimen ID: <span className="font-mono font-medium">{details.specimen_id}</span>
            </div>
            <div>Type: <span className="font-medium">{details.specimen_type}</span></div>
            <div>
              Status:
              <span className={`ml-1 px-2 py-0.5 rounded text-xs font-medium ${
                details.status === 'resulted' ? 'bg-green-100 text-green-700' :
                details.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {details.status}
              </span>
            </div>
          </div>
        );

      case 'biopsy_resulted':
        return (
          <div className="text-sm mt-1 space-y-1">
            <div className="font-medium text-gray-900">
              Diagnosis: {details.diagnosis}
            </div>
            {details.malignancy_type && (
              <div className="text-red-600 font-medium">
                Malignancy: {details.malignancy_type}
              </div>
            )}
            {details.margins && (
              <div className="text-gray-600">
                Margins: <span className="font-medium">{details.margins}</span>
              </div>
            )}
          </div>
        );

      case 'photo_captured':
        return (
          <div className="text-sm text-gray-600 mt-1 space-y-1">
            <div>Type: <span className="font-medium">{details.photo_type}</span></div>
            {details.notes && <div className="text-gray-500 italic">{details.notes}</div>}
          </div>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <AlertCircle className="w-5 h-5 inline mr-2" />
        {error}
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="w-12 h-12 mx-auto mb-2 text-gray-400" />
        <p>No timeline events recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

        {/* Events */}
        <div className="space-y-6">
          {timeline.map((event, index) => {
            const colors = getEventColor(event.event_type);
            const formatted = formatDate(event.event_date);

            return (
              <div key={`${event.event_type}-${event.related_id}-${index}`} className="relative flex gap-4">
                {/* Icon */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center z-10`}>
                  <div className={colors.text}>
                    {getEventIcon(event.event_type)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{event.event_description}</h4>
                      {renderEventDetails(event)}
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-xs font-medium text-gray-900">{formatted.date}</div>
                      <div className="text-xs text-gray-500">{formatted.time}</div>
                    </div>
                  </div>

                  {event.provider_name && (
                    <div className="mt-2 text-xs text-gray-500">
                      By: <span className="font-medium">{event.provider_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="border-t pt-4 mt-6">
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {timeline.filter(e => e.event_type === 'photo_captured').length}
            </div>
            <div className="text-gray-600">Photos</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">
              {timeline.filter(e => e.event_type.includes('biopsy')).length}
            </div>
            <div className="text-gray-600">Biopsies</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-indigo-600">
              {timeline.filter(e => e.event_type === 'measurement').length}
            </div>
            <div className="text-gray-600">Measurements</div>
          </div>
        </div>
      </div>
    </div>
  );
}
