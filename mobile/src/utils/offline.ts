import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const OFFLINE_QUEUE_KEY = '@offline_queue';

interface QueuedRequest {
  id: string;
  method: string;
  url: string;
  data?: any;
  timestamp: number;
}

export const offlineUtils = {
  // Check network connectivity
  isConnected: async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    return state.isConnected ?? false;
  },

  // Listen for connectivity changes
  onConnectivityChange: (callback: (isConnected: boolean) => void) => {
    return NetInfo.addEventListener((state) => {
      callback(state.isConnected ?? false);
    });
  },

  // Queue a request for later
  queueRequest: async (method: string, url: string, data?: any) => {
    try {
      const queue = await offlineUtils.getQueue();
      const request: QueuedRequest = {
        id: Date.now().toString(),
        method,
        url,
        data,
        timestamp: Date.now(),
      };

      queue.push(request);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to queue request:', error);
    }
  },

  // Get queued requests
  getQueue: async (): Promise<QueuedRequest[]> => {
    try {
      const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      return queueJson ? JSON.parse(queueJson) : [];
    } catch (error) {
      console.error('Failed to get queue:', error);
      return [];
    }
  },

  // Clear queue
  clearQueue: async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  },

  // Process queued requests
  processQueue: async (apiClient: any) => {
    try {
      const isConnected = await offlineUtils.isConnected();
      if (!isConnected) {
        return;
      }

      const queue = await offlineUtils.getQueue();
      if (queue.length === 0) {
        return;
      }

      console.log(`Processing ${queue.length} queued requests...`);

      for (const request of queue) {
        try {
          await apiClient[request.method.toLowerCase()](request.url, request.data);
          console.log(`Processed request: ${request.method} ${request.url}`);
        } catch (error) {
          console.error(`Failed to process request:`, error);
          // Keep failed requests in queue
          continue;
        }
      }

      await offlineUtils.clearQueue();
    } catch (error) {
      console.error('Failed to process queue:', error);
    }
  },

  // Cache data locally
  cacheData: async (key: string, data: any) => {
    try {
      await AsyncStorage.setItem(`@cache_${key}`, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  },

  // Get cached data
  getCachedData: async (key: string): Promise<any> => {
    try {
      const cachedJson = await AsyncStorage.getItem(`@cache_${key}`);
      return cachedJson ? JSON.parse(cachedJson) : null;
    } catch (error) {
      console.error('Failed to get cached data:', error);
      return null;
    }
  },

  // Clear cache
  clearCache: async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((key) => key.startsWith('@cache_'));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  },
};
