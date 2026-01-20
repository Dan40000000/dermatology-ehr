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
import { format, addDays } from 'date-fns';
import apiClient from '../../api/client';

interface Appointment {
  id: string;
  patientName: string;
  appointmentTime: string;
  appointmentType: string;
  status: string;
  duration: number;
}

export default function ScheduleScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSchedule();
  }, [selectedDate]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const date = format(selectedDate, 'yyyy-MM-dd');
      const response = await apiClient.get(`/api/appointments?date=${date}`);
      setAppointments(response.data);
    } catch (error) {
      console.error('Failed to load schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderAppointment = ({ item }: { item: Appointment }) => (
    <TouchableOpacity style={styles.appointmentCard}>
      <View style={styles.timeSection}>
        <Text style={styles.time}>{item.appointmentTime}</Text>
        <Text style={styles.duration}>{item.duration} min</Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.patientName}>{item.patientName}</Text>
        <Text style={styles.type}>{item.appointmentType}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
    </TouchableOpacity>
  );

  const renderDateSelector = () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

    return (
      <View style={styles.dateSelector}>
        {dates.map((date) => {
          const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
          return (
            <TouchableOpacity
              key={date.toString()}
              style={[styles.dateButton, isSelected && styles.dateButtonSelected]}
              onPress={() => setSelectedDate(date)}
            >
              <Text style={[styles.dateDay, isSelected && styles.dateDaySelected]}>
                {format(date, 'EEE')}
              </Text>
              <Text style={[styles.dateNumber, isSelected && styles.dateNumberSelected]}>
                {format(date, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
      </View>

      {renderDateSelector()}

      <FlatList
        data={appointments}
        renderItem={renderAppointment}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSchedule} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="calendar-blank" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No appointments scheduled</Text>
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
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  dateSelector: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  dateButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  dateButtonSelected: {
    backgroundColor: '#0066cc',
  },
  dateDay: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dateDaySelected: {
    color: '#fff',
  },
  dateNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  dateNumberSelected: {
    color: '#fff',
  },
  list: {
    padding: 20,
  },
  appointmentCard: {
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
  timeSection: {
    width: 80,
    marginRight: 16,
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066cc',
  },
  duration: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  details: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  type: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
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
