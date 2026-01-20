import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { apiClient } from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  biometricEnabled: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  authenticateWithBiometric: () => Promise<boolean>;
  checkBiometricSupport: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [token, tenantId, userData, biometric] = await Promise.all([
        AsyncStorage.getItem('accessToken'),
        AsyncStorage.getItem('tenantId'),
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('biometricEnabled'),
      ]);

      if (token && tenantId && userData) {
        setUser(JSON.parse(userData));
        setBiometricEnabled(biometric === 'true');
      }
    } catch (error) {
      console.error('Failed to load stored auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await apiClient.getClient().post('/api/auth/login', {
        email,
        password,
      });

      const { accessToken, user: userData } = response.data;

      await apiClient.setAuth(accessToken, userData.tenantId);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
    } catch (error: any) {
      console.error('Login failed:', error);
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  };

  const logout = async () => {
    try {
      await apiClient.clearAuth();
      await AsyncStorage.multiRemove(['user', 'biometricEnabled', 'lastActivity']);
      setUser(null);
      setBiometricEnabled(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const checkBiometricSupport = async (): Promise<boolean> => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return compatible && enrolled;
    } catch (error) {
      console.error('Biometric check failed:', error);
      return false;
    }
  };

  const enableBiometric = async () => {
    try {
      const supported = await checkBiometricSupport();
      if (!supported) {
        throw new Error('Biometric authentication not available');
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable biometric login',
        fallbackLabel: 'Use passcode',
      });

      if (result.success) {
        await AsyncStorage.setItem('biometricEnabled', 'true');
        setBiometricEnabled(true);
      }
    } catch (error) {
      console.error('Enable biometric failed:', error);
      throw error;
    }
  };

  const disableBiometric = async () => {
    try {
      await AsyncStorage.setItem('biometricEnabled', 'false');
      setBiometricEnabled(false);
    } catch (error) {
      console.error('Disable biometric failed:', error);
    }
  };

  const authenticateWithBiometric = async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access the app',
        fallbackLabel: 'Use password',
      });

      return result.success;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    biometricEnabled,
    login,
    logout,
    enableBiometric,
    disableBiometric,
    authenticateWithBiometric,
    checkBiometricSupport,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
