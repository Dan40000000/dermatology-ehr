import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import apiClient from '../../api/client';

interface Note {
  id: string;
  patientName: string;
  noteType: string;
  createdAt: string;
  chiefComplaint: string;
  status: string;
}

export default function NotesScreen({ navigation }: any) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/api/ambient/notes');
      setNotes(response.data);
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderNote = ({ item }: { item: Note }) => (
    <TouchableOpacity style={styles.noteCard}>
      <View style={styles.noteHeader}>
        <View style={styles.noteInfo}>
          <Text style={styles.patientName}>{item.patientName}</Text>
          <Text style={styles.chiefComplaint}>{item.chiefComplaint}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.noteFooter}>
        <Text style={styles.noteType}>{item.noteType}</Text>
        <Text style={styles.noteDate}>{format(new Date(item.createdAt), 'MMM d, yyyy h:mm a')}</Text>
      </View>
    </TouchableOpacity>
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return '#4caf50';
      case 'pending':
        return '#ff9800';
      case 'draft':
        return '#999';
      default:
        return '#666';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Clinical Notes</Text>
        <TouchableOpacity
          style={styles.newNoteButton}
          onPress={() => navigation.navigate('AINoteTaking')}
        >
          <MaterialCommunityIcons name="microphone" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes}
        renderItem={renderNote}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadNotes} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="note-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No clinical notes</Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('AINoteTaking')}
            >
              <Text style={styles.createButtonText}>Create Voice Note</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  newNoteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 20,
  },
  noteCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  noteInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  chiefComplaint: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  noteType: {
    fontSize: 13,
    color: '#0066cc',
  },
  noteDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
