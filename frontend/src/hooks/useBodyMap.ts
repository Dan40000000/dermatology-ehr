import { useState, useEffect, useCallback } from 'react';
import { LesionMarker } from '../components/BodyMap/BodyMapMarker';
import toast from 'react-hot-toast';

export interface UseBodyMapOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useBodyMap(patientId: string, options: UseBodyMapOptions = {}) {
  const { autoRefresh = false, refreshInterval = 30000 } = options;

  const [lesions, setLesions] = useState<LesionMarker[]>([]);
  const [selectedLesion, setSelectedLesion] = useState<LesionMarker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  // Fetch all lesions for the patient
  const fetchLesions = useCallback(async () => {
    if (!patientId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/patients/${patientId}/lesions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch lesions');
      }

      const data = await response.json();
      setLesions(data.lesions || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load lesions';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  // Add a new lesion
  const addLesion = useCallback(
    async (lesionData: Partial<LesionMarker>) => {
      if (!patientId) {
        toast.error('Patient ID is required');
        return;
      }

      try {
        const response = await fetch(`/api/patients/${patientId}/lesions`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...lesionData,
            patient_id: patientId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to add lesion');
        }

        const data = await response.json();
        toast.success('Lesion added successfully');

        // Refresh the lesions list
        await fetchLesions();

        // Select the newly created lesion
        if (data.id) {
          const newLesion = lesions.find((l) => l.id === data.id);
          if (newLesion) {
            setSelectedLesion(newLesion);
          }
        }

        return data.id;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to add lesion';
        toast.error(errorMessage);
        throw err;
      }
    },
    [patientId, fetchLesions, lesions]
  );

  // Update an existing lesion
  const updateLesion = useCallback(
    async (lesionId: string, updates: Partial<LesionMarker>) => {
      try {
        const response = await fetch(`/api/patients/${patientId}/lesions/${lesionId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error('Failed to update lesion');
        }

        toast.success('Lesion updated successfully');

        // Update the lesion in state
        setLesions((prev) =>
          prev.map((lesion) =>
            lesion.id === lesionId
              ? { ...lesion, ...updates, updated_at: new Date().toISOString() }
              : lesion
          )
        );

        // Update selected lesion if it's the one being updated
        if (selectedLesion?.id === lesionId) {
          setSelectedLesion((prev) => (prev ? { ...prev, ...updates } : null));
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update lesion';
        toast.error(errorMessage);
        throw err;
      }
    },
    [patientId, selectedLesion]
  );

  // Delete a lesion
  const deleteLesion = useCallback(
    async (lesionId: string) => {
      try {
        const response = await fetch(`/api/patients/${patientId}/lesions/${lesionId}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to delete lesion');
        }

        toast.success('Lesion deleted successfully');

        // Remove the lesion from state
        setLesions((prev) => prev.filter((lesion) => lesion.id !== lesionId));

        // Clear selection if deleted lesion was selected
        if (selectedLesion?.id === lesionId) {
          setSelectedLesion(null);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete lesion';
        toast.error(errorMessage);
        throw err;
      }
    },
    [patientId, selectedLesion]
  );

  // Get lesion by ID
  const getLesionById = useCallback(
    (lesionId: string): LesionMarker | undefined => {
      return lesions.find((lesion) => lesion.id === lesionId);
    },
    [lesions]
  );

  // Get lesions by status
  const getLesionsByStatus = useCallback(
    (status: string): LesionMarker[] => {
      return lesions.filter((lesion) => lesion.status === status);
    },
    [lesions]
  );

  // Get lesions requiring attention (suspicious or malignant)
  const getLesionsNeedingAttention = useCallback((): LesionMarker[] => {
    return lesions.filter((lesion) => lesion.status === 'suspicious' || lesion.status === 'malignant');
  }, [lesions]);

  // Reset zoom and pan
  const resetView = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchLesions();
  }, [fetchLesions]);

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLesions();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchLesions]);

  return {
    // State
    lesions,
    selectedLesion,
    isLoading,
    error,
    zoomLevel,
    panOffset,

    // Actions
    setSelectedLesion,
    addLesion,
    updateLesion,
    deleteLesion,
    refreshLesions: fetchLesions,

    // Helpers
    getLesionById,
    getLesionsByStatus,
    getLesionsNeedingAttention,

    // View controls
    setZoomLevel,
    setPanOffset,
    resetView,
  };
}
