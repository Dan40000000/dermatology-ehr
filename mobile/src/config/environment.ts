import Constants from 'expo-constants';

const ENV = {
  dev: {
    apiUrl: 'http://localhost:4000',
    name: 'Development',
  },
  staging: {
    apiUrl: 'https://staging-api.yourdomain.com',
    name: 'Staging',
  },
  prod: {
    apiUrl: 'https://api.yourdomain.com',
    name: 'Production',
  },
};

const getEnvVars = () => {
  // You can use __DEV__ to determine environment
  // or use expo-constants to read from app.json
  if (__DEV__) {
    return ENV.dev;
  }

  // In production, you would determine the environment
  // based on build configuration or expo-constants
  const releaseChannel = Constants.expoConfig?.extra?.releaseChannel;

  if (releaseChannel === 'staging') {
    return ENV.staging;
  }

  if (releaseChannel === 'production') {
    return ENV.prod;
  }

  return ENV.dev;
};

export default getEnvVars();
