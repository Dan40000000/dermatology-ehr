import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export const useInactivityTimer = (onTimeout: () => void) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(onTimeout, INACTIVITY_TIMEOUT);
    AsyncStorage.setItem('lastActivity', Date.now().toString());
  };

  const checkInactivity = async () => {
    const lastActivity = await AsyncStorage.getItem('lastActivity');
    if (lastActivity) {
      const timeSinceLastActivity = Date.now() - parseInt(lastActivity, 10);
      if (timeSinceLastActivity > INACTIVITY_TIMEOUT) {
        onTimeout();
      }
    }
  };

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        checkInactivity();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    resetTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      subscription.remove();
    };
  }, [onTimeout]);

  return { resetTimer };
};
