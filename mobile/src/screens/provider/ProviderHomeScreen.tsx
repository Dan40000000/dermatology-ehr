import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import apiClient from '../../api/client';

interface TodayStats {
  totalAppointments: number;
  completedAppointments: number;
  pendingAppointments: number;
  cancelledAppointments: number;
}

interface UpcomingAppointment {
  id: string;
  patientName: string;
  appointmentTime: string;
  appointmentType: string;
  status: string;
}

export default function ProviderHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [stats, setStats] = useState<TodayStats>({
    totalAppointments: 0,
    completedAppointments: 0,
    pendingAppointments: 0,
    cancelledAppointments: 0,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [statsRes, appointmentsRes] = await Promise.all([
        apiClient.get(`/api/appointments/stats?date=${today}`),
        apiClient.get(`/api/appointments?date=${today}&status=scheduled&limit=5`),
      ]);

      setStats(statsRes.data);
      setUpcomingAppointments(appointmentsRes.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadDashboard} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning,</Text>
          <Text style={styles.name}>Dr. {user?.fullName.split(' ')[1] || user?.fullName}</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <MaterialCommunityIcons name="bell-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.dateCard}>
        <MaterialCommunityIcons name="calendar-today" size={24} color="#0066cc" />
        <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMMM d, yyyy')}</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#0066cc' }]}>
          <Text style={styles.statValue}>{stats.totalAppointments}</Text>
          <Text style={styles.statLabel}>Total Today</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#4caf50' }]}>
          <Text style={styles.statValue}>{stats.completedAppointments}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#ff9800' }]}>
          <Text style={styles.statValue}>{stats.pendingAppointments}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#f44336' }]}>
          <Text style={styles.statValue}>{stats.cancelledAppointments}</Text>
          <Text style={styles.statLabel}>Cancelled</Text>
        </View>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('AINoteTaking')}
        >
          <MaterialCommunityIcons name="microphone" size={28} color="#fff" />
          <Text style={styles.actionButtonText}>Voice Note</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#4caf50' }]}
          onPress={() => navigation.navigate('Patients')}
        >
          <MaterialCommunityIcons name="account-search" size={28} color="#fff" />
          <Text style={styles.actionButtonText}>Find Patient</Text>
        </TouchableOpacity>
      </View>

      {upcomingAppointments.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Next Appointments</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Schedule')}>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>

          {upcomingAppointments.map((appointment) => (
            <TouchableOpacity key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.timeIndicator}>
                <Text style={styles.timeText}>{appointment.appointmentTime}</Text>
              </View>
              <View style={styles.appointmentDetails}>
                <Text style={styles.patientName}>{appointment.patientName}</Text>
                <Text style={styles.appointmentType}>{appointment.appointmentType}</Text>
              </View>
              <TouchableOpacity style={styles.startButton}>
                <Text style={styles.startButtonText}>Start</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Links</Text>
        <TouchableOpacity style={styles.linkCard}>
          <MaterialCommunityIcons name="clipboard-text" size={24} color="#0066cc" />
          <Text style={styles.linkText}>Recent Notes</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkCard}>
          <MaterialCommunityIcons name="image-multiple" size={24} color="#0066cc" />
          <Text style={styles.linkText}>Clinical Photos</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkCard}>
          <MaterialCommunityIcons name="file-document" size={24} color="#0066cc" />
          <Text style={styles.linkText}>Prescriptions</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  notificationButton: {},
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#0066cc',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  seeAll: {
    fontSize: 14,
    color: '#0066cc',
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
  timeIndicator: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },
  appointmentDetails: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  appointmentType: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  startButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  linkCard: {
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
  linkText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    marginLeft: 12,
  },
});
