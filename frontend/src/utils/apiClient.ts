/**
 * Enhanced API Client
 * Centralized API client with comprehensive error handling, retry logic, and timeout support
 */

import {
  ApiException,
  handleApiResponse,
  fetchWithTimeout,
  withRetry,
  logError,
  isAuthError,
} from './errorHandling';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:4000');
const TENANT_HEADER = 'x-tenant-id';

export interface ApiRequestOptions extends RequestInit {
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  skipErrorHandling?: boolean;
}

export interface ApiClientConfig {
  tenantId: string;
  accessToken: string;
  onAuthError?: () => void;
}

/**
 * Enhanced API client class
 */
export class ApiClient {
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  /**
   * Update configuration (e.g., when token refreshes)
   */
  updateConfig(config: Partial<ApiClientConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Build headers for API request
   */
  private buildHeaders(customHeaders?: HeadersInit): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.accessToken}`,
      [TENANT_HEADER]: this.config.tenantId,
      ...customHeaders,
    };
  }

  /**
   * Make an API request with enhanced error handling
   */
  private async request<T>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const {
      timeout = 30000,
      retry = false,
      maxRetries = 3,
      skipErrorHandling = false,
      headers,
      ...fetchOptions
    } = options;

    const url = `${API_BASE}${endpoint}`;
    const requestHeaders = this.buildHeaders(headers);

    const makeRequest = async (): Promise<T> => {
      try {
        const response = await fetchWithTimeout(url, {
          ...fetchOptions,
          headers: requestHeaders,
          credentials: 'include',
          timeout,
        });

        return await handleApiResponse<T>(response);
      } catch (error) {
        // Handle authentication errors
        if (isAuthError(error) && this.config.onAuthError) {
          this.config.onAuthError();
        }

        // Log error for debugging
        logError(error, `API Request: ${endpoint}`);

        if (skipErrorHandling) {
          throw error;
        }

        throw error;
      }
    };

    // Apply retry logic if enabled
    if (retry) {
      return withRetry(makeRequest, { maxAttempts: maxRetries });
    }

    return makeRequest();
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
      ...options,
    });
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    data?: any,
    options?: ApiRequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    });
  }

  /**
   * Upload file(s)
   */
  async upload<T>(
    endpoint: string,
    formData: FormData,
    options?: Omit<ApiRequestOptions, 'body'>
  ): Promise<T> {
    const { headers, ...restOptions } = options || {};

    // Don't set Content-Type for FormData - browser will set it with boundary
    const uploadHeaders = {
      'Authorization': `Bearer ${this.config.accessToken}`,
      [TENANT_HEADER]: this.config.tenantId,
      ...headers,
    };

    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: uploadHeaders,
      ...restOptions,
    });
  }
}

/**
 * Create API client instance
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

/**
 * Helper to build query string from params
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}
