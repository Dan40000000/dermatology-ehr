import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';

export default function ProfileScreen() {
  const { user, logout, biometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleBiometricToggle = async (value: boolean) => {
    try {
      if (value) {
        await enableBiometric();
      } else {
        await disableBiometric();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', onPress: logout, style: 'destructive' },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </Text>
        </View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="fingerprint" size={24} color="#333" />
            <Text style={styles.settingText}>Biometric Login</Text>
          </View>
          <Switch value={biometricEnabled} onValueChange={handleBiometricToggle} />
        </View>
        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="lock-reset" size={24} color="#333" />
            <Text style={styles.settingText}>Change Password</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="bell" size={24} color="#333" />
            <Text style={styles.settingText}>Push Notifications</Text>
          </View>
          <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="account-edit" size={24} color="#333" />
            <Text style={styles.settingText}>Personal Information</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="medical-bag" size={24} color="#333" />
            <Text style={styles.settingText}>Medical History</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="credit-card-settings" size={24} color="#333" />
            <Text style={styles.settingText}>Payment Methods</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="help-circle" size={24} color="#333" />
            <Text style={styles.settingText}>Help & FAQ</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <MaterialCommunityIcons name="shield-check" size={24} color="#333" />
            <Text style={styles.settingText}>Privacy Policy</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <MaterialCommunityIcons name="logout" size={24} color="#f44336" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Version 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    alignItems: 'center',
    padding: 32,
    paddingTop: 60,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    margin: 20,
    marginTop: 32,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
  },
  version: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginBottom: 32,
  },
});
