# Quick Command Reference

## Setup & Installation

```bash
# Navigate to mobile directory
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/mobile

# Install dependencies (first time only)
npm install

# Verify installation
./verify-installation.sh
```

## Running the App

```bash
# Start development server
npx expo start

# Start with cache cleared
npx expo start -c

# iOS Simulator (Mac only)
npx expo start --ios
# or press 'i' after npx expo start

# Android Emulator
npx expo start --android
# or press 'a' after npx expo start

# Web browser (limited functionality)
npx expo start --web
# or press 'w' after npx expo start
```

## Backend

```bash
# Start backend (in separate terminal)
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run dev

# Check backend health
curl http://localhost:4000/health

# View backend logs
tail -f backend/logs/app.log
```

## Testing

```bash
# Install Expo Go app on your phone:
# - iOS: App Store → "Expo Go"
# - Android: Play Store → "Expo Go"

# Then scan QR code shown in terminal
```

## Building for Production

```bash
# Install EAS CLI (first time only)
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios --profile production

# Build for Android  
eas build --platform android --profile production

# Build for both
eas build --platform all --profile production
```

## Submitting to App Stores

```bash
# Submit to iOS App Store
eas submit --platform ios

# Submit to Android Play Store
eas submit --platform android
```

## Troubleshooting

```bash
# Clear all caches
npx expo start -c

# Reinstall dependencies
rm -rf node_modules
npm install

# Reset Metro bundler
rm -rf .expo
npx expo start -c

# Check for Expo updates
npx expo upgrade

# View detailed logs
npx expo start --dev-client
```

## Development

```bash
# TypeScript type checking
npx tsc --noEmit

# Format code (if you have prettier)
npx prettier --write "src/**/*.{ts,tsx}"

# Lint code (if you have eslint)
npx eslint "src/**/*.{ts,tsx}"
```

## Useful Expo Commands

```bash
# Show QR code again
# Press 'r' in terminal

# Open developer menu on device
# Shake device or press Cmd+D (iOS) / Cmd+M (Android)

# Reload app
# Press 'r' in terminal or shake device and select 'Reload'

# Show/hide performance monitor
# In dev menu → 'Perf Monitor'
```

## Environment Variables

```bash
# Create .env file (optional)
cat > .env << 'ENV'
API_URL=http://localhost:4000
ENV

# Use in code:
# import Constants from 'expo-constants';
# const apiUrl = Constants.expoConfig?.extra?.apiUrl;
```

## Device Testing

```bash
# Get your computer's IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Update API URL in src/api/client.ts:
# const API_BASE_URL = 'http://YOUR_IP:4000';

# Ensure devices on same WiFi network
# Then run: npx expo start
```

## Common Issues

### "Cannot connect to Metro"
```bash
npx expo start -c
```

### "Backend not responding"
```bash
cd backend && npm run dev
```

### "Microphone permission denied"
```bash
# iOS: Settings → Expo Go → Microphone → Enable
# Android: Settings → Apps → Expo Go → Permissions → Enable
```

### "Module not found"
```bash
rm -rf node_modules
npm install
npx expo start -c
```

## Quick Start Sequence

```bash
# Terminal 1: Backend
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run dev

# Terminal 2: Mobile
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/mobile
npx expo start

# On your phone:
# 1. Install "Expo Go"
# 2. Scan QR code
# 3. Test the app!
```

## File Locations

```
App entry point:     mobile/App.tsx
API client:          mobile/src/api/client.ts
AI notes service:    mobile/src/api/aiNotes.ts
Recording screen:    mobile/src/screens/AINoteTakingScreen.tsx
Review screen:       mobile/src/screens/AINoteReviewScreen.tsx
Demo launcher:       mobile/src/screens/DemoLauncherScreen.tsx
Type definitions:    mobile/src/types/index.ts
```

## Resources

- Full docs: `mobile/README.md`
- Quick start: `mobile/QUICKSTART.md`
- Implementation: `MOBILE_AI_NOTES_IMPLEMENTATION.md`
- Expo docs: https://docs.expo.dev
- React Native: https://reactnative.dev

---

**Most Common Command:** `npx expo start`

**Most Important:** Make sure backend is running first!
