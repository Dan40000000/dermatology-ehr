import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { aiNotesApi } from '../api/aiNotes';
import { Recording, Patient } from '../types';

interface Props {
  patient: Patient;
  providerId: string;
  encounterId?: string;
  onComplete: (transcriptId: string, recordingId: string) => void;
  onCancel: () => void;
}

const { width } = Dimensions.get('window');
const recordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export default function AINoteTakingScreen({ 
  patient, 
  providerId, 
  encounterId,
  onComplete,
  onCancel 
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  const audioRecorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(audioRecorder, 100);
  const duration = Math.floor(recorderState.durationMillis / 1000);
  const audioLevel = recorderState.metering === undefined
    ? 0
    : Math.max(0, Math.min(100, (recorderState.metering + 160) * 0.625));
  const recordingDataRef = useRef<Recording | null>(null);

  useEffect(() => {
    return () => {
      if (audioRecorder.isRecording) {
        void audioRecorder.stop();
      }
      if (recordingDataRef.current) {
        void aiNotesApi.deleteRecording(recordingDataRef.current.id);
      }
    };
  }, [audioRecorder]);

  const requestPermissions = async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Permission Required',
        'Microphone access is required to record clinical notes.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const beginRecording = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    let recordingData: Recording | null = null;
    try {
      recordingData = await aiNotesApi.startRecording({
        patientId: patient.id,
        providerId,
        encounterId,
        consentObtained: true,
        consentMethod: 'verbal',
      });
      recordingDataRef.current = recordingData;

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      setIsRecording(true);
      setIsPaused(false);
    } catch {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
      if (recordingData) {
        await aiNotesApi.deleteRecording(recordingData.id).catch(() => undefined);
      }
      recordingDataRef.current = null;
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const startRecording = () => {
    if (!consentGiven) {
      Alert.alert(
        'Patient Consent Required',
        'Please confirm that the patient has consented to this recording.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Patient Consents',
            onPress: () => {
              setConsentGiven(true);
              void beginRecording();
            }
          },
        ]
      );
      return;
    }
    void beginRecording();
  };

  const pauseRecording = async () => {
    try {
      audioRecorder.pause();
      setIsPaused(true);
    } catch {
      Alert.alert('Error', 'Failed to pause recording.');
    }
  };

  const resumeRecording = async () => {
    try {
      audioRecorder.record();
      setIsPaused(false);
    } catch {
      Alert.alert('Error', 'Failed to resume recording.');
    }
  };

  const stopRecording = async () => {
    if (!recordingDataRef.current) return;

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      const recordingData = recordingDataRef.current;
      recordingDataRef.current = null;

      setIsRecording(false);
      setIsPaused(false);

      if (uri) {
        await processRecording(uri, recordingData);
      }
    } catch {
      Alert.alert('Error', 'Failed to stop recording.');
    }
  };

  const discardRecording = async () => {
    const recordingData = recordingDataRef.current;
    recordingDataRef.current = null;
    if (audioRecorder.isRecording || isPaused) {
      await audioRecorder.stop().catch(() => undefined);
    }
    if (recordingData) {
      await aiNotesApi.deleteRecording(recordingData.id).catch(() => undefined);
    }
    setIsRecording(false);
    setIsPaused(false);
  };

  const processRecording = async (uri: string, recordingData: Recording) => {
    setIsProcessing(true);
    
    try {
      setProcessingStage('Uploading recording...');
      const upload = await aiNotesApi.uploadRecording(recordingData.id, uri, duration);
      
      setProcessingStage('Transcribing audio...');
      const transcriptId = upload.transcriptId
        || (await aiNotesApi.transcribeRecording(recordingData.id)).id;
      
      setProcessingStage('Complete!');
      
      setTimeout(() => {
        onComplete(transcriptId, recordingData.id);
      }, 500);
    } catch {
      Alert.alert(
        'Processing Error',
        'Failed to process the recording. Please try again.',
        [
          { text: 'Cancel', onPress: onCancel },
          { text: 'Retry', onPress: () => processRecording(uri, recordingData) },
        ]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const minStr = String(mins).padStart(2, '0');
    const secStr = String(secs).padStart(2, '0');
    return minStr + ':' + secStr;
  };

  const handleCancel = () => {
    if (isRecording) {
      Alert.alert(
        'Cancel Recording',
        'Are you sure you want to cancel this recording?',
        [
          { text: 'Continue Recording', style: 'cancel' },
          { 
            text: 'Cancel Recording', 
            style: 'destructive',
            onPress: async () => {
              await discardRecording();
              onCancel();
            }
          },
        ]
      );
    } else {
      onCancel();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Clinical Note</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.patientInfo}>
          <Text style={styles.label}>Patient</Text>
          <Text style={styles.patientName}>
            {patient.firstName} {patient.lastName}
          </Text>
          {patient.mrn && <Text style={styles.mrn}>MRN: {patient.mrn}</Text>}
        </View>

        {!isRecording && !isProcessing && (
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>Ready to Record</Text>
            <Text style={styles.instructions}>
              Tap the microphone button below to start recording your patient encounter.
              The AI will transcribe and generate a structured SOAP note for review.
            </Text>
          </View>
        )}

        {(isRecording || isProcessing) && (
          <View style={styles.recordingContainer}>
            <View style={styles.visualizerContainer}>
              {isRecording && (
                <>
                  <View style={styles.visualizer}>
                    {[...Array(20)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.visualizerBar,
                          {
                            height: Math.max(4, (audioLevel / 100) * 60 * (0.5 + Math.random() * 0.5)),
                            opacity: isPaused ? 0.3 : 1,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={[styles.recordingIndicator, isPaused && styles.pausedIndicator]}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>
                      {isPaused ? 'PAUSED' : 'RECORDING'}
                    </Text>
                  </View>
                </>
              )}
              
              {isProcessing && (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color="#7C3AED" />
                  <Text style={styles.processingText}>{processingStage}</Text>
                </View>
              )}
            </View>

            {isRecording && (
              <Text style={styles.duration}>{formatDuration(duration)}</Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!isRecording && !isProcessing && (
          <TouchableOpacity
            style={styles.recordButton}
            onPress={startRecording}
            activeOpacity={0.8}
          >
            <View style={styles.recordButtonInner}>
              <Text style={styles.micIcon}>🎤</Text>
            </View>
            <Text style={styles.recordButtonText}>Start Recording</Text>
          </TouchableOpacity>
        )}

        {isRecording && !isPaused && (
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={pauseRecording}
              activeOpacity={0.8}
            >
              <Text style={styles.controlIcon}>⏸</Text>
              <Text style={styles.controlButtonText}>Pause</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.stopButton]}
              onPress={stopRecording}
              activeOpacity={0.8}
            >
              <View style={styles.stopIcon} />
              <Text style={styles.controlButtonText}>Stop & Process</Text>
            </TouchableOpacity>
          </View>
        )}

        {isRecording && isPaused && (
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={resumeRecording}
              activeOpacity={0.8}
            >
              <Text style={styles.controlIcon}>▶️</Text>
              <Text style={styles.controlButtonText}>Resume</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.stopButton]}
              onPress={stopRecording}
              activeOpacity={0.8}
            >
              <View style={styles.stopIcon} />
              <Text style={styles.controlButtonText}>Stop & Process</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cancelButton: {
    padding: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  patientInfo: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  patientName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  mrn: {
    fontSize: 14,
    color: '#6B7280',
  },
  instructionsContainer: {
    backgroundColor: '#EEF2FF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4338CA',
    marginBottom: 8,
  },
  instructions: {
    fontSize: 14,
    color: '#4338CA',
    lineHeight: 20,
  },
  recordingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  visualizerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  visualizer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    gap: 4,
    marginBottom: 24,
  },
  visualizerBar: {
    width: 4,
    backgroundColor: '#7C3AED',
    borderRadius: 2,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pausedIndicator: {
    backgroundColor: '#F59E0B',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 8,
  },
  recordingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  duration: {
    fontSize: 48,
    fontWeight: '300',
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  footer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  recordButton: {
    alignItems: 'center',
  },
  recordButtonInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micIcon: {
    fontSize: 36,
  },
  recordButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7C3AED',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  controlButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 12,
  },
  stopButton: {
    backgroundColor: '#FEE2E2',
  },
  controlIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#DC2626',
    borderRadius: 4,
    marginBottom: 8,
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
});
