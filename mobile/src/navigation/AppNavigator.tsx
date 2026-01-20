import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useInactivityTimer } from '../hooks/useInactivityTimer';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';

// Patient Screens
import PatientHomeScreen from '../screens/patient/PatientHomeScreen';
import AppointmentsScreen from '../screens/patient/AppointmentsScreen';
import MessagesScreen from '../screens/patient/MessagesScreen';
import BillsScreen from '../screens/patient/BillsScreen';
import ProfileScreen from '../screens/patient/ProfileScreen';

// Provider Screens
import ProviderHomeScreen from '../screens/provider/ProviderHomeScreen';
import ScheduleScreen from '../screens/provider/ScheduleScreen';
import PatientLookupScreen from '../screens/provider/PatientLookupScreen';
import NotesScreen from '../screens/provider/NotesScreen';
import ProviderProfileScreen from '../screens/provider/ProviderProfileScreen';

// Shared Screens
import AINoteTakingScreen from '../screens/AINoteTakingScreen';
import AINoteReviewScreen from '../screens/AINoteReviewScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function PatientTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Appointments') {
            iconName = 'calendar';
          } else if (route.name === 'Messages') {
            iconName = 'message-text';
          } else if (route.name === 'Bills') {
            iconName = 'credit-card';
          } else if (route.name === 'Profile') {
            iconName = 'account';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0066cc',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={PatientHomeScreen} />
      <Tab.Screen name="Appointments" component={AppointmentsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Bills" component={BillsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function ProviderTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'home';

          if (route.name === 'Home') {
            iconName = 'view-dashboard';
          } else if (route.name === 'Schedule') {
            iconName = 'calendar-clock';
          } else if (route.name === 'Patients') {
            iconName = 'account-search';
          } else if (route.name === 'Notes') {
            iconName = 'note-text';
          } else if (route.name === 'Profile') {
            iconName = 'account';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0066cc',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={ProviderHomeScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Patients" component={PatientLookupScreen} />
      <Tab.Screen name="Notes" component={NotesScreen} />
      <Tab.Screen name="Profile" component={ProviderProfileScreen} />
    </Tab.Navigator>
  );
}

function MainStack() {
  const { user } = useAuth();
  const isProvider = user?.role === 'provider' || user?.role === 'admin';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={isProvider ? ProviderTabs : PatientTabs} />
      <Stack.Screen
        name="AINoteTaking"
        component={AINoteTakingScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="AINoteReview"
        component={AINoteReviewScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isLoading, logout } = useAuth();
  const { resetTimer } = useInactivityTimer(logout);

  useEffect(() => {
    // Reset timer on any user interaction
    const handleInteraction = () => resetTimer();

    // You would add touch/gesture listeners here in a real implementation
    return () => {
      // Cleanup
    };
  }, []);

  if (isLoading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer>
      {user ? (
        <MainStack />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
