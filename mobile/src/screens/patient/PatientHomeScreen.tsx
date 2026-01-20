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

interface Appointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  providerName: string;
  appointmentType: string;
  status: string;
}

interface Message {
  id: string;
  subject: string;
  createdAt: string;
  read: boolean;
}

export default function PatientHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [appointmentsRes, messagesRes] = await Promise.all([
        apiClient.get('/api/patient-portal/appointments?limit=3'),
        apiClient.get('/api/patient-portal/messages?unread=true&limit=5'),
      ]);

      setUpcomingAppointments(appointmentsRes.data);
      setUnreadMessages(messagesRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadDashboardData} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.name}>{user?.fullName}</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <MaterialCommunityIcons name="bell-outline" size={24} color="#333" />
          {unreadMessages.length > 0 && <View style={styles.badge} />}
        </TouchableOpacity>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Appointments')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#e3f2fd' }]}>
            <MaterialCommunityIcons name="calendar-plus" size={28} color="#0066cc" />
          </View>
          <Text style={styles.actionText}>Book Appointment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Messages')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#e8f5e9' }]}>
            <MaterialCommunityIcons name="message-text" size={28} color="#4caf50" />
          </View>
          <Text style={styles.actionText}>Send Message</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Bills')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#fff3e0' }]}>
            <MaterialCommunityIcons name="credit-card" size={28} color="#ff9800" />
          </View>
          <Text style={styles.actionText}>Pay Bill</Text>
        </TouchableOpacity>
      </View>

      {upcomingAppointments.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Appointments')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          {upcomingAppointments.map((appointment) => (
            <View key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.appointmentDate}>
                <Text style={styles.appointmentDay}>
                  {format(new Date(appointment.appointmentDate), 'd')}
                </Text>
                <Text style={styles.appointmentMonth}>
                  {format(new Date(appointment.appointmentDate), 'MMM')}
                </Text>
              </View>
              <View style={styles.appointmentDetails}>
                <Text style={styles.appointmentProvider}>{appointment.providerName}</Text>
                <Text style={styles.appointmentType}>{appointment.appointmentType}</Text>
                <Text style={styles.appointmentTime}>{appointment.appointmentTime}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
            </View>
          ))}
        </View>
      )}

      {unreadMessages.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Unread Messages</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Messages')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          {unreadMessages.map((message) => (
            <View key={message.id} style={styles.messageCard}>
              <View style={styles.messageIcon}>
                <MaterialCommunityIcons name="email" size={20} color="#0066cc" />
              </View>
              <View style={styles.messageDetails}>
                <Text style={styles.messageSubject}>{message.subject}</Text>
                <Text style={styles.messageDate}>
                  {format(new Date(message.createdAt), 'MMM d, yyyy')}
                </Text>
              </View>
              <View style={styles.unreadDot} />
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Health Resources</Text>
        <TouchableOpacity style={styles.resourceCard}>
          <MaterialCommunityIcons name="file-document" size={24} color="#0066cc" />
          <Text style={styles.resourceText}>Visit Summaries</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.resourceCard}>
          <MaterialCommunityIcons name="pill" size={24} color="#0066cc" />
          <Text style={styles.resourceText}>Medications</Text>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.resourceCard}>
          <MaterialCommunityIcons name="test-tube" size={24} color="#0066cc" />
          <Text style={styles.resourceText}>Lab Results</Text>
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
  notificationButton: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f44336',
  },
  quickActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
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
  appointmentDate: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  appointmentDay: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  appointmentMonth: {
    fontSize: 12,
    color: '#fff',
  },
  appointmentDetails: {
    flex: 1,
  },
  appointmentProvider: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  appointmentType: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  appointmentTime: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  messageCard: {
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
  messageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  messageDetails: {
    flex: 1,
  },
  messageSubject: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  messageDate: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0066cc',
  },
  resourceCard: {
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
  resourceText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    marginLeft: 12,
  },
});
