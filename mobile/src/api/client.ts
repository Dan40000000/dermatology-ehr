import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import environment from '../config/environment';

const API_BASE_URL = environment.apiUrl;

class ApiClient {
  private client: AxiosInstance;
  private tenantId: string | null = null;
  private accessToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.loadStoredCredentials();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      async (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        if (this.tenantId) {
          config.headers['x-tenant-id'] = this.tenantId;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          await this.handleUnauthorized();
        }
        return Promise.reject(error);
      }
    );
  }

  private async loadStoredCredentials() {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const tenant = await AsyncStorage.getItem('tenantId');
      
      if (token) this.accessToken = token;
      if (tenant) this.tenantId = tenant;
    } catch (error) {
      console.error('Failed to load stored credentials:', error);
    }
  }

  private async handleUnauthorized() {
    await this.clearAuth();
  }

  async setAuth(accessToken: string, tenantId: string) {
    this.accessToken = accessToken;
    this.tenantId = tenantId;

    await AsyncStorage.setItem('accessToken', accessToken);
    await AsyncStorage.setItem('tenantId', tenantId);
  }

  async clearAuth() {
    this.accessToken = null;
    this.tenantId = null;

    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('tenantId');
  }

  getClient() {
    return this.client;
  }
}

export const apiClient = new ApiClient();
export default apiClient.getClient();
