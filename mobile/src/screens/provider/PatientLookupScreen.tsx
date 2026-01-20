import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import apiClient from '../../api/client';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  mrn: string;
  lastVisit?: string;
}

export default function PatientLookupScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setPatients([]);
      return;
    }

    setSearching(true);
    try {
      const response = await apiClient.get(`/api/patients/search?q=${query}`);
      setPatients(response.data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const renderPatient = ({ item }: { item: Patient }) => (
    <TouchableOpacity style={styles.patientCard}>
      <View style={styles.patientAvatar}>
        <Text style={styles.patientInitials}>
          {item.firstName[0]}
          {item.lastName[0]}
        </Text>
      </View>
      <View style={styles.patientInfo}>
        <Text style={styles.patientName}>
          {item.firstName} {item.lastName}
        </Text>
        <Text style={styles.patientDetails}>DOB: {format(new Date(item.dateOfBirth), 'MM/dd/yyyy')}</Text>
        <Text style={styles.patientDetails}>MRN: {item.mrn}</Text>
        {item.lastVisit && (
          <Text style={styles.lastVisit}>
            Last visit: {format(new Date(item.lastVisit), 'MM/dd/yyyy')}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Patient</Text>
      </View>

      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={24} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or MRN..."
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={patients}
        renderItem={renderPatient}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          searchQuery.length >= 2 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-search" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {searching ? 'Searching...' : 'No patients found'}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-multiple" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Enter name or MRN to search</Text>
            </View>
          )
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
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#333',
  },
  list: {
    padding: 20,
    paddingTop: 0,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  patientInitials: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  patientDetails: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  lastVisit: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
});
