/**
 * Utilities Index
 * Central export point for all utility functions
 */

// Error Handling Utilities
export {
  ApiException,
  parseErrorResponse,
  getStatusMessage,
  getErrorMessage,
  isNetworkError,
  isAuthError,
  isPermissionError,
  isValidationError,
  extractValidationErrors,
  defaultShouldRetry,
  withRetry,
  fetchWithTimeout,
  handleApiResponse,
  logError,
  type ApiError,
  type RetryConfig,
} from './errorHandling';

// API Client
export {
  createApiClient,
  buildQueryString,
  ApiClient,
  type ApiRequestOptions,
  type ApiClientConfig,
} from './apiClient';

// Validation Utilities
export {
  Rules,
  MedicalRules,
  validateField,
  validateForm,
  hasErrors,
  formatErrorMessage,
  useFormValidation,
  type ValidationRule,
  type FieldValidation,
  type ValidationErrors,
} from './validation';

// Export Utilities (existing)
export * from './export';
export * from './exportUtils';
