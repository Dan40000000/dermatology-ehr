/**
 * Drug Interaction Checker
 *
 * Runs drug-drug and drug-allergy checks against the eRx safety endpoints.
 */

import { useEffect, useState } from 'react';
import { checkDrugAllergies, checkDrugInteractions } from '../../api-erx';
import { useAuth } from '../../contexts/AuthContext';
import { DrugInteractionWarnings } from '../DrugInteractionWarnings';

// Local type definitions (TypeScript interfaces are erased at runtime, so we define them locally)
interface DrugInteraction {
  severity: 'severe' | 'moderate' | 'mild';
  description: string;
  medication1: string;
  medication2: string;
  clinicalEffects?: string;
  management?: string;
}

interface AllergyWarning {
  allergen: string;
  severity: string;
  reaction: string;
}

interface DrugInteractionCheckerProps {
  medicationId?: string;
  medicationName?: string;
  patientId?: string;
}

export function DrugInteractionChecker({
  medicationId,
  medicationName,
  patientId,
}: DrugInteractionCheckerProps) {
  const { session } = useAuth();
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);
  const [allergies, setAllergies] = useState<AllergyWarning[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const medicationLabel = (medicationName || medicationId || '').trim();

  useEffect(() => {
    let isActive = true;
    const timeout = setTimeout(async () => {
      if (!session?.tenantId || !session?.accessToken || !patientId || medicationLabel.length < 2) {
        if (isActive) {
          setInteractions([]);
          setAllergies([]);
          setHasChecked(false);
          setError(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const [interactionResult, allergyResult] = await Promise.all([
          checkDrugInteractions(session.tenantId, session.accessToken, medicationLabel, patientId),
          checkDrugAllergies(session.tenantId, session.accessToken, medicationLabel, patientId),
        ]);

        if (!isActive) return;
        setInteractions(interactionResult.interactions || []);
        setAllergies(allergyResult.allergies || []);
        setHasChecked(true);
      } catch (err: any) {
        if (!isActive) return;
        setError(err?.message || 'Unable to run safety checks');
        setHasChecked(true);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [session?.tenantId, session?.accessToken, patientId, medicationLabel]);

  if (!patientId || !medicationLabel) {
    return null;
  }

  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1rem',
        marginTop: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>🩺</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.875rem' }}>
            Medication Safety Check
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.25rem' }}>
            {isLoading ? 'Checking for interactions and allergies...' : 'Reviewing interactions and allergy conflicts.'}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '0.75rem',
            fontSize: '0.75rem',
            color: '#b91c1c',
            marginBottom: '0.75rem',
          }}
        >
          {error}
        </div>
      )}

      <DrugInteractionWarnings interactions={interactions} allergies={allergies} />

      {!isLoading && !error && hasChecked && interactions.length === 0 && allergies.length === 0 && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            padding: '0.75rem',
            fontSize: '0.75rem',
            color: '#166534',
          }}
        >
          No interaction or allergy warnings detected for this medication.
        </div>
      )}
    </div>
  );
}
