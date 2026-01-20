import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import apiClient from './client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const notificationsApi = {
  requestPermissions: async (): Promise<boolean> => {
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return false;
    }

    return true;
  },

  registerForPushNotifications: async () => {
    try {
      const hasPermission = await notificationsApi.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // Replace with your Expo project ID
      });

      if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0066cc',
        });
      }

      // Send token to backend
      await apiClient.post('/api/notifications/register', {
        token: token.data,
        platform: Platform.OS,
      });

      return token.data;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  },

  scheduleNotification: async (title: string, body: string, trigger: any) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger,
    });
  },

  cancelAllNotifications: async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  addNotificationReceivedListener: (callback: (notification: any) => void) => {
    return Notifications.addNotificationReceivedListener(callback);
  },

  addNotificationResponseReceivedListener: (callback: (response: any) => void) => {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },
};
