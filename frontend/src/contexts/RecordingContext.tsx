/**
 * RecordingContext
 *
 * Global state management for ambient recording across page navigation
 * Ensures recording state persists when user navigates between pages
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface RecordingState {
  isRecording: boolean;
  recordingId: string | null;
  duration: number;
  patientId: string | null;
  patientName: string | null;
}

interface RecordingContextType extends RecordingState {
  setIsRecording: (isRecording: boolean) => void;
  setRecordingId: (recordingId: string | null) => void;
  setDuration: (duration: number | ((prev: number) => number)) => void;
  setPatientId: (patientId: string | null) => void;
  setPatientName: (patientName: string | null) => void;
  resetRecording: () => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);

  const resetRecording = () => {
    setIsRecording(false);
    setRecordingId(null);
    setDuration(0);
    setPatientId(null);
    setPatientName(null);
  };

  return (
    <RecordingContext.Provider
      value={{
        isRecording,
        recordingId,
        duration,
        patientId,
        patientName,
        setIsRecording,
        setRecordingId,
        setDuration,
        setPatientId,
        setPatientName,
        resetRecording
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (context === undefined) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
}
