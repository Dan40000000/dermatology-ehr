import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import AINoteTakingScreen from './AINoteTakingScreen';
import AINoteReviewScreen from './AINoteReviewScreen';
import { Patient } from '../types';

export default function DemoLauncherScreen() {
  const [currentScreen, setCurrentScreen] = useState<'launcher' | 'recording' | 'review'>('launcher');
  const [transcriptId, setTranscriptId] = useState<string>('');
  const [recordingId, setRecordingId] = useState<string>('');

  // Demo patient data
  const demoPatient: Patient = {
    id: 'demo-patient-1',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1985-03-15',
    mrn: 'MRN-12345',
  };

  const demoProviderId = 'demo-provider-1';
  const demoEncounterId = 'demo-encounter-1';

  const handleStartRecording = () => {
    setCurrentScreen('recording');
  };

  const handleRecordingComplete = (tId: string, rId: string) => {
    setTranscriptId(tId);
    setRecordingId(rId);
    setCurrentScreen('review');
  };

  const handleReviewComplete = (noteId: string) => {
    console.log('Note completed:', noteId);
    setCurrentScreen('launcher');
  };

  const handleCancel = () => {
    setCurrentScreen('launcher');
  };

  if (currentScreen === 'recording') {
    return (
      <AINoteTakingScreen
        patient={demoPatient}
        providerId={demoProviderId}
        encounterId={demoEncounterId}
        onComplete={handleRecordingComplete}
        onCancel={handleCancel}
      />
    );
  }

  if (currentScreen === 'review') {
    return (
      <AINoteReviewScreen
        transcriptId={transcriptId}
        recordingId={recordingId}
        encounterId={demoEncounterId}
        onComplete={handleReviewComplete}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Dermatology EHR</Text>
          <Text style={styles.subtitle}>AI Clinical Note Assistant</Text>
          <Text style={styles.version}>Mobile Demo v1.0</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🎤 Voice-Powered Documentation</Text>
          <Text style={styles.infoText}>
            Record patient encounters and let AI generate structured SOAP notes automatically.
          </Text>
        </View>

        <View style={styles.featuresList}>
          <Text style={styles.featuresTitle}>Features</Text>
          
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🎙</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Real-time Recording</Text>
              <Text style={styles.featureDesc}>High-quality audio with visual feedback</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🤖</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>AI Transcription</Text>
              <Text style={styles.featureDesc}>Powered by OpenAI Whisper</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📋</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>SOAP Note Generation</Text>
              <Text style={styles.featureDesc}>Structured clinical documentation</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💊</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Smart Extraction</Text>
              <Text style={styles.featureDesc}>Medications, allergies, and ICD-10 codes</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>✏️</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Review & Edit</Text>
              <Text style={styles.featureDesc}>Full control with audit trail</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📊</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureName}>Chart Integration</Text>
              <Text style={styles.featureDesc}>Save directly to patient encounters</Text>
            </View>
          </View>
        </View>

        <View style={styles.demoInfo}>
          <Text style={styles.demoTitle}>Demo Patient</Text>
          <Text style={styles.demoText}>
            {demoPatient.firstName} {demoPatient.lastName}
          </Text>
          <Text style={styles.demoMrn}>MRN: {demoPatient.mrn}</Text>
        </View>

        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartRecording}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>Start New AI Note</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Tablet & Phone Optimized</Text>
          <Text style={styles.footerSubtext}>iOS & Android Compatible</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#7C3AED',
    marginBottom: 4,
  },
  version: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoCard: {
    backgroundColor: '#EEF2FF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4338CA',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4338CA',
    lineHeight: 20,
  },
  featuresList: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 32,
  },
  featureContent: {
    flex: 1,
  },
  featureName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  demoInfo: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#7C3AED',
    borderStyle: 'dashed',
  },
  demoTitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  demoText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  demoMrn: {
    fontSize: 14,
    color: '#6B7280',
  },
  startButton: {
    backgroundColor: '#7C3AED',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
