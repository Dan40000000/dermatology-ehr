/**
 * Provider Status Component
 *
 * Shows provider availability status for waiting room displays
 * Indicates if providers are available, with patients, or running late
 */

interface Provider {
  providerId: string;
  providerName: string;
  status: 'available' | 'with_patient' | 'running_late' | 'unavailable';
  currentPatient?: string;
  delayMinutes: number;
  estimatedNextAvailable?: Date | string;
}

interface ProviderStatusProps {
  providers: Provider[];
  showDelayInfo?: boolean;
  compact?: boolean;
  className?: string;
}

export function ProviderStatus({
  providers,
  showDelayInfo = true,
  compact = false,
  className = '',
}: ProviderStatusProps) {
  const getStatusConfig = (status: string, delayMinutes: number) => {
    if (delayMinutes > 15) {
      return {
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        label: 'Running Late',
      };
    }

    switch (status) {
      case 'available':
        return {
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="6" />
            </svg>
          ),
          label: 'Available',
        };
      case 'with_patient':
        return {
          color: 'bg-blue-100 text-blue-800 border-blue-200',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ),
          label: 'With Patient',
        };
      case 'running_late':
        return {
          color: 'bg-orange-100 text-orange-800 border-orange-200',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: 'Running Late',
        };
      case 'unavailable':
        return {
          color: 'bg-gray-100 text-gray-600 border-gray-200',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          ),
          label: 'Unavailable',
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-600 border-gray-200',
          icon: null,
          label: status,
        };
    }
  };

  if (providers.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={`provider-status-compact flex flex-wrap gap-2 ${className}`}>
        {providers.map((provider) => {
          const config = getStatusConfig(provider.status, provider.delayMinutes);
          return (
            <div
              key={provider.providerId}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${config.color}`}
            >
              {config.icon}
              <span className="text-sm font-medium">{provider.providerName}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`provider-status ${className}`}>
      <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Provider Status
      </h3>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const config = getStatusConfig(provider.status, provider.delayMinutes);
          return (
            <div
              key={provider.providerId}
              className={`rounded-lg border p-4 ${config.color}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{provider.providerName}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {config.icon}
                    <span className="text-sm">{config.label}</span>
                  </div>
                </div>
              </div>

              {showDelayInfo && provider.delayMinutes > 0 && (
                <div className="mt-2 pt-2 border-t border-current/10">
                  <p className="text-sm opacity-80">
                    Running ~{provider.delayMinutes} min behind
                  </p>
                </div>
              )}

              {provider.currentPatient && (
                <div className="mt-2 pt-2 border-t border-current/10">
                  <p className="text-sm opacity-80">
                    Currently with: {provider.currentPatient}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProviderStatus;
