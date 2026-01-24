import { useEffect, useMemo, useState } from 'react';
import type { Session } from '../types';
import { fetchEligibilityHistory, fetchEligibilityHistoryBatch } from '../api';

export type EligibilityHistoryItem = {
  verification_status?: string;
  verified_at?: string;
  has_issues?: boolean;
  issue_notes?: string | null;
};

type EligibilityMap = Record<string, EligibilityHistoryItem | null>;

export function useEligibilityByPatient(
  session: Session | null | undefined,
  patientIds: string[]
) {
  const [eligibilityByPatient, setEligibilityByPatient] = useState<EligibilityMap>({});
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const uniquePatientIds = useMemo(() => {
    const unique = new Set(patientIds.filter(Boolean));
    return Array.from(unique).sort();
  }, [patientIds.join('|')]);

  useEffect(() => {
    let isActive = true;

    if (!session || uniquePatientIds.length === 0) {
      setEligibilityByPatient({});
      setEligibilityLoading(false);
      return () => {
        isActive = false;
      };
    }

    const loadEligibility = async () => {
      setEligibilityLoading(true);
      try {
        const batchResponse = await fetchEligibilityHistoryBatch(
          session.tenantId,
          session.accessToken,
          uniquePatientIds
        );

        if (!isActive) return;

        const history = batchResponse?.history ?? {};
        const nextMap: EligibilityMap = {};
        uniquePatientIds.forEach((patientId) => {
          nextMap[patientId] = history[patientId] ?? null;
        });
        setEligibilityByPatient(nextMap);
      } catch {
        try {
          const results = await Promise.allSettled(
            uniquePatientIds.map(async (patientId) => {
              const res = await fetchEligibilityHistory(session.tenantId, session.accessToken, patientId);
              const history = res?.history || [];
              return { patientId, latest: history[0] || null };
            })
          );

          if (!isActive) return;

          const nextMap: EligibilityMap = {};
          results.forEach((result, index) => {
            const patientId = uniquePatientIds[index];
            if (result.status === 'fulfilled') {
              nextMap[patientId] = result.value.latest;
            } else {
              nextMap[patientId] = null;
            }
          });

          setEligibilityByPatient(nextMap);
        } catch {
          if (isActive) {
            setEligibilityByPatient({});
          }
        }
      } finally {
        if (isActive) {
          setEligibilityLoading(false);
        }
      }
    };

    loadEligibility();

    return () => {
      isActive = false;
    };
  }, [session?.tenantId, session?.accessToken, uniquePatientIds.join('|')]);

  return { eligibilityByPatient, eligibilityLoading };
}
