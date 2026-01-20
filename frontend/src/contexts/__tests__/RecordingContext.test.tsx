import { render, screen, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecordingProvider, useRecording } from '../RecordingContext';
import type { ReactNode } from 'react';

describe('RecordingContext', () => {
  it('should throw error when useRecording is used outside RecordingProvider', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useRecording());
    }).toThrow('useRecording must be used within a RecordingProvider');

    consoleErrorSpy.mockRestore();
  });

  it('should provide initial state', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordingId).toBeNull();
    expect(result.current.duration).toBe(0);
    expect(result.current.patientId).toBeNull();
    expect(result.current.patientName).toBeNull();
  });

  it('should update isRecording state', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current.isRecording).toBe(false);

    act(() => {
      result.current.setIsRecording(true);
    });

    expect(result.current.isRecording).toBe(true);

    act(() => {
      result.current.setIsRecording(false);
    });

    expect(result.current.isRecording).toBe(false);
  });

  it('should update recordingId state', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current.recordingId).toBeNull();

    act(() => {
      result.current.setRecordingId('recording-123');
    });

    expect(result.current.recordingId).toBe('recording-123');

    act(() => {
      result.current.setRecordingId(null);
    });

    expect(result.current.recordingId).toBeNull();
  });

  it('should update duration state with number', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current.duration).toBe(0);

    act(() => {
      result.current.setDuration(60);
    });

    expect(result.current.duration).toBe(60);

    act(() => {
      result.current.setDuration(120);
    });

    expect(result.current.duration).toBe(120);
  });

  it('should update duration state with function', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    act(() => {
      result.current.setDuration(10);
    });

    expect(result.current.duration).toBe(10);

    act(() => {
      result.current.setDuration((prev) => prev + 5);
    });

    expect(result.current.duration).toBe(15);

    act(() => {
      result.current.setDuration((prev) => prev * 2);
    });

    expect(result.current.duration).toBe(30);
  });

  it('should update patientId state', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current.patientId).toBeNull();

    act(() => {
      result.current.setPatientId('patient-123');
    });

    expect(result.current.patientId).toBe('patient-123');

    act(() => {
      result.current.setPatientId(null);
    });

    expect(result.current.patientId).toBeNull();
  });

  it('should update patientName state', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current.patientName).toBeNull();

    act(() => {
      result.current.setPatientName('John Doe');
    });

    expect(result.current.patientName).toBe('John Doe');

    act(() => {
      result.current.setPatientName('Jane Smith');
    });

    expect(result.current.patientName).toBe('Jane Smith');
  });

  it('should reset all recording state', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    // Set all values
    act(() => {
      result.current.setIsRecording(true);
      result.current.setRecordingId('recording-123');
      result.current.setDuration(120);
      result.current.setPatientId('patient-123');
      result.current.setPatientName('John Doe');
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordingId).toBe('recording-123');
    expect(result.current.duration).toBe(120);
    expect(result.current.patientId).toBe('patient-123');
    expect(result.current.patientName).toBe('John Doe');

    // Reset
    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordingId).toBeNull();
    expect(result.current.duration).toBe(0);
    expect(result.current.patientId).toBeNull();
    expect(result.current.patientName).toBeNull();
  });

  it('should maintain state across rerenders', () => {
    const { result, rerender } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    act(() => {
      result.current.setIsRecording(true);
      result.current.setRecordingId('recording-123');
      result.current.setDuration(60);
      result.current.setPatientId('patient-123');
      result.current.setPatientName('John Doe');
    });

    rerender();

    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordingId).toBe('recording-123');
    expect(result.current.duration).toBe(60);
    expect(result.current.patientId).toBe('patient-123');
    expect(result.current.patientName).toBe('John Doe');
  });

  it('should provide all context values', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    expect(result.current).toHaveProperty('isRecording');
    expect(result.current).toHaveProperty('recordingId');
    expect(result.current).toHaveProperty('duration');
    expect(result.current).toHaveProperty('patientId');
    expect(result.current).toHaveProperty('patientName');
    expect(result.current).toHaveProperty('setIsRecording');
    expect(result.current).toHaveProperty('setRecordingId');
    expect(result.current).toHaveProperty('setDuration');
    expect(result.current).toHaveProperty('setPatientId');
    expect(result.current).toHaveProperty('setPatientName');
    expect(result.current).toHaveProperty('resetRecording');

    expect(typeof result.current.setIsRecording).toBe('function');
    expect(typeof result.current.setRecordingId).toBe('function');
    expect(typeof result.current.setDuration).toBe('function');
    expect(typeof result.current.setPatientId).toBe('function');
    expect(typeof result.current.setPatientName).toBe('function');
    expect(typeof result.current.resetRecording).toBe('function');
  });

  it('should render children', () => {
    render(
      <RecordingProvider>
        <div>Test Child</div>
      </RecordingProvider>
    );

    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('should handle complete recording workflow', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    // Start recording
    act(() => {
      result.current.setIsRecording(true);
      result.current.setRecordingId('rec-001');
      result.current.setPatientId('patient-001');
      result.current.setPatientName('Alice Johnson');
    });

    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordingId).toBe('rec-001');

    // Update duration periodically (simulating timer)
    act(() => {
      result.current.setDuration((prev) => prev + 1);
    });

    expect(result.current.duration).toBe(1);

    act(() => {
      result.current.setDuration((prev) => prev + 1);
    });

    expect(result.current.duration).toBe(2);

    // Stop recording
    act(() => {
      result.current.setIsRecording(false);
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordingId).toBe('rec-001'); // ID should persist
    expect(result.current.duration).toBe(2); // Duration should persist

    // Reset for next recording
    act(() => {
      result.current.resetRecording();
    });

    expect(result.current.recordingId).toBeNull();
    expect(result.current.duration).toBe(0);
  });

  it('should allow multiple state updates in sequence', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    act(() => {
      result.current.setPatientId('patient-1');
    });

    act(() => {
      result.current.setPatientName('Patient One');
    });

    act(() => {
      result.current.setIsRecording(true);
    });

    act(() => {
      result.current.setRecordingId('rec-1');
    });

    act(() => {
      result.current.setDuration(10);
    });

    expect(result.current.patientId).toBe('patient-1');
    expect(result.current.patientName).toBe('Patient One');
    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordingId).toBe('rec-1');
    expect(result.current.duration).toBe(10);
  });

  it('should handle duration increment pattern', () => {
    const { result } = renderHook(() => useRecording(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RecordingProvider>{children}</RecordingProvider>
      ),
    });

    // Simulate timer incrementing duration every second
    for (let i = 1; i <= 10; i++) {
      act(() => {
        result.current.setDuration((prev) => prev + 1);
      });

      expect(result.current.duration).toBe(i);
    }
  });
});
