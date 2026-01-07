import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { aiNotesApi } from '../api/aiNotes';
import { ClinicalNote, NoteEdit, Transcript } from '../types';

interface Props {
  transcriptId: string;
  recordingId: string;
  encounterId?: string;
  onComplete: (noteId: string) => void;
  onCancel: () => void;
}

export default function AINoteReviewScreen({
  transcriptId,
  recordingId,
  encounterId,
  onComplete,
  onCancel,
}: Props) {
  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [edits, setEdits] = useState<NoteEdit[]>([]);

  useEffect(() => {
    loadTranscriptAndGenerateNote();
  }, [transcriptId]);

  const loadTranscriptAndGenerateNote = async () => {
    try {
      setIsLoading(true);
      
      const transcriptData = await aiNotesApi.getTranscript(transcriptId);
      setTranscript(transcriptData);
      
      setIsGenerating(true);
      const generatedNote = await aiNotesApi.generateNote(transcriptId);
      setNote(generatedNote);
    } catch (error) {
      console.error('Failed to load transcript and generate note:', error);
      Alert.alert('Error', 'Failed to generate clinical note. Please try again.');
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  const handleEditSection = (section: string, currentValue: string) => {
    setEditingSection(section);
    setEditValue(currentValue);
    setEditReason('');
  };

  const handleSaveEdit = () => {
    if (!note || !editingSection) return;

    const previousValue = (note as any)[editingSection];
    
    if (editValue === previousValue) {
      setEditingSection(null);
      return;
    }

    const newEdit: NoteEdit = {
      section: editingSection,
      previousValue,
      newValue: editValue,
      editReason: editReason || undefined,
    };

    setEdits([...edits, newEdit]);
    
    setNote({
      ...note,
      [editingSection]: editValue,
    });

    setEditingSection(null);
    setEditValue('');
    setEditReason('');
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
    setEditValue('');
    setEditReason('');
  };

  const handleApproveNote = async () => {
    if (!note) return;

    try {
      setIsSaving(true);

      if (edits.length > 0) {
        await aiNotesApi.updateNote(note.id, note, edits);
      }

      await aiNotesApi.reviewNote(note.id, 'approve');

      if (encounterId) {
        await aiNotesApi.applyToEncounter(note.id, encounterId);
      }

      Alert.alert('Success', 'Clinical note has been approved and saved.', [
        { text: 'OK', onPress: () => onComplete(note.id) },
      ]);
    } catch (error) {
      console.error('Failed to approve note:', error);
      Alert.alert('Error', 'Failed to save the clinical note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderSOAPSection = (
    title: string,
    fieldName: keyof ClinicalNote,
    content: string,
    confidence?: number
  ) => {
    const isEditing = editingSection === fieldName;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {confidence !== undefined && (
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>{Math.round(confidence * 100)}%</Text>
            </View>
          )}
        </View>
        
        {!isEditing ? (
          <>
            <Text style={styles.sectionContent}>{content || 'Not documented'}</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => handleEditSection(fieldName as string, content)}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.textArea}
              value={editValue}
              onChangeText={setEditValue}
              multiline
              numberOfLines={6}
              placeholder={`Enter ${title.toLowerCase()}...`}
              autoFocus
            />
            <TextInput
              style={styles.reasonInput}
              value={editReason}
              onChangeText={setEditReason}
              placeholder="Reason for edit (optional)"
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleCancelEdit}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton]}
                onPress={handleSaveEdit}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderCodeSection = (
    title: string,
    codes: Array<{ code: string; description: string; confidence: number }>
  ) => {
    if (!codes || codes.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {codes.map((item, index) => (
          <View key={index} style={styles.codeItem}>
            <View style={styles.codeContent}>
              <Text style={styles.codeText}>{item.code}</Text>
              <Text style={styles.codeDescription}>{item.description}</Text>
            </View>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>{Math.round(item.confidence * 100)}%</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderMedications = () => {
    if (!note || !note.mentionedMedications || note.mentionedMedications.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Medications Mentioned</Text>
        {note.mentionedMedications.map((med, index) => (
          <View key={index} style={styles.medicationItem}>
            <Text style={styles.medicationName}>{med.name}</Text>
            {med.dosage && <Text style={styles.medicationDetail}>Dosage: {med.dosage}</Text>}
            {med.frequency && <Text style={styles.medicationDetail}>Frequency: {med.frequency}</Text>}
          </View>
        ))}
      </View>
    );
  };

  const renderAllergies = () => {
    if (!note || !note.mentionedAllergies || note.mentionedAllergies.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Allergies Mentioned</Text>
        <View style={styles.allergyContainer}>
          {note.mentionedAllergies.map((allergy, index) => (
            <View key={index} style={styles.allergyBadge}>
              <Text style={styles.allergyText}>{allergy}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderFollowUpTasks = () => {
    if (!note || !note.followUpTasks || note.followUpTasks.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Follow-up Tasks</Text>
        {note.followUpTasks.map((task, index) => (
          <View key={index} style={styles.taskItem}>
            <Text style={styles.taskBullet}>•</Text>
            <Text style={styles.taskText}>{task}</Text>
          </View>
        ))}
      </View>
    );
  };

  if (isLoading || isGenerating) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7C3AED" />
        <Text style={styles.loadingText}>
          {isLoading ? 'Loading transcript...' : 'Generating clinical note...'}
        </Text>
        <Text style={styles.loadingSubtext}>
          This may take 10-20 seconds
        </Text>
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to generate note</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadTranscriptAndGenerateNote}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Note</Text>
        <TouchableOpacity 
          onPress={() => setShowTranscript(true)} 
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Transcript</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.confidenceHeader}>
          <Text style={styles.overallConfidenceLabel}>Overall Confidence</Text>
          <View style={styles.overallConfidenceBadge}>
            <Text style={styles.overallConfidenceText}>
              {Math.round(note.overallConfidence * 100)}%
            </Text>
          </View>
        </View>

        {renderSOAPSection(
          'Chief Complaint',
          'chiefComplaint',
          note.chiefComplaint,
          note.sectionConfidence.chiefComplaint
        )}

        {renderSOAPSection(
          'History of Present Illness (HPI)',
          'hpi',
          note.hpi,
          note.sectionConfidence.hpi
        )}

        {renderSOAPSection(
          'Review of Systems (ROS)',
          'ros',
          note.ros,
          note.sectionConfidence.ros
        )}

        {renderSOAPSection(
          'Physical Exam',
          'physicalExam',
          note.physicalExam,
          note.sectionConfidence.physicalExam
        )}

        {renderSOAPSection(
          'Assessment',
          'assessment',
          note.assessment,
          note.sectionConfidence.assessment
        )}

        {renderSOAPSection(
          'Plan',
          'plan',
          note.plan,
          note.sectionConfidence.plan
        )}

        {renderCodeSection('ICD-10 Codes', note.suggestedIcd10Codes)}
        {renderCodeSection('CPT Codes', note.suggestedCptCodes)}
        {renderMedications()}
        {renderAllergies()}
        {renderFollowUpTasks()}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.approveButton, isSaving && styles.disabledButton]}
          onPress={handleApproveNote}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.approveButtonText}>Approve & Save to Chart</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showTranscript}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Transcript</Text>
            <TouchableOpacity onPress={() => setShowTranscript(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            {transcript?.segments.map((segment, index) => (
              <View key={index} style={styles.transcriptSegment}>
                <View style={styles.transcriptHeader}>
                  <Text style={[
                    styles.speaker,
                    segment.speaker === 'doctor' ? styles.doctorSpeaker : styles.patientSpeaker
                  ]}>
                    {segment.speaker === 'doctor' ? 'Doctor' : 'Patient'}
                  </Text>
                  <Text style={styles.timestamp}>
                    {Math.floor(segment.startTime / 60)}:{String(Math.floor(segment.startTime % 60)).padStart(2, '0')}
                  </Text>
                </View>
                <Text style={styles.transcriptText}>{segment.text}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
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
  headerButton: {
    padding: 8,
    minWidth: 80,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#7C3AED',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  overallConfidenceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  overallConfidenceBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  overallConfidenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  confidenceBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338CA',
  },
  sectionContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  editButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7C3AED',
  },
  editContainer: {
    marginTop: 8,
  },
  textArea: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    color: '#111827',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  reasonInput: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    color: '#111827',
    marginTop: 8,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#7C3AED',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  codeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  codeContent: {
    flex: 1,
  },
  codeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  codeDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  medicationItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  medicationName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  medicationDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  allergyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  allergyBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  allergyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#DC2626',
  },
  taskItem: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  taskBullet: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
  },
  taskText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  approveButton: {
    backgroundColor: '#7C3AED',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7C3AED',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  transcriptSegment: {
    marginBottom: 20,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  speaker: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  doctorSpeaker: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
  },
  patientSpeaker: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
    fontVariant: ['tabular-nums'],
  },
  transcriptText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
