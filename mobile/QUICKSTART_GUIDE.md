# Mobile App Quick Start Guide

## Overview
This is a comprehensive React Native/Expo mobile app for the Dermatology EHR system with both patient and provider functionality.

## Installation

### 1. Install Dependencies
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/mobile
npm install
```

### 2. Configure Backend URL

For **simulator/emulator** testing (localhost):
- No changes needed - uses `http://localhost:4000` by default

For **physical device** testing:
1. Find your computer's IP address:
   ```bash
   # Mac/Linux
   ifconfig | grep "inet "

   # Or simply
   ipconfig getifaddr en0
   ```

2. Update `/Users/danperry/Desktop/Dermatology program/derm-app/mobile/src/config/environment.ts`:
   ```typescript
   dev: {
     apiUrl: 'http://YOUR_IP:4000', // e.g., 'http://192.168.1.100:4000'
     name: 'Development',
   }
   ```

### 3. Start Backend
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run dev
```

Verify backend is running at `http://localhost:4000/health`

### 4. Start Mobile App

**Option A: iOS Simulator (Mac only)**
```bash
npm run ios
```

**Option B: Android Emulator**
```bash
npm run android
```

**Option C: Physical Device (Recommended)**
```bash
npm start
# Scan QR code with Expo Go app (download from App/Play Store)
```

## First Login

### Patient Account
- Email: `patient@example.com`
- Password: `password123`

### Provider Account
- Email: `doctor@example.com`
- Password: `password123`

## Features Overview

### Patient Portal
1. **Home**: Dashboard with appointments, messages, quick actions
2. **Appointments**: View/book appointments
3. **Messages**: Secure messaging with providers
4. **Bills**: View and pay bills
5. **Profile**: Settings and biometric authentication

### Provider Portal
1. **Home**: Today's schedule and stats
2. **Schedule**: 7-day schedule view
3. **Patients**: Search and lookup patients
4. **Notes**: View and create AI clinical notes
5. **Profile**: Settings and preferences

## Key Features

### Authentication
- **Login**: Email/password authentication
- **Biometric**: Enable Face ID/fingerprint in Profile
- **Auto-Logout**: 15-minute inactivity timeout

### AI Voice Notes (Provider Only)
1. Tap microphone icon on Home screen
2. Record patient encounter
3. AI transcribes and generates SOAP note
4. Review and edit note
5. Approve and save to chart

### Push Notifications
- Appointment reminders
- New messages
- Bill notifications
- Enable in Profile settings

### Offline Support
- App works offline
- Requests queued automatically
- Syncs when connection restored

## Common Tasks

### Book Appointment (Patient)
1. Home → "Book Appointment" or Appointments tab
2. Tap "+" button
3. Select appointment type, date, time
4. Submit request

### Send Message (Patient)
1. Messages tab → Compose button
2. Enter subject and message
3. Send

### Record Voice Note (Provider)
1. Home → "Voice Note" or Notes tab
2. Tap microphone button
3. Record encounter
4. Stop and process
5. Review generated note
6. Approve and save

### Find Patient (Provider)
1. Patients tab
2. Search by name or MRN
3. Select patient
4. View details/history

## Troubleshooting

### "Cannot connect to backend"
- Verify backend is running: `http://localhost:4000/health`
- For physical device: Update IP in environment.ts
- Check firewall settings
- Ensure devices on same WiFi network

### "Metro bundler error"
```bash
# Clear cache and restart
npx expo start -c
```

### "Build failed"
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### Biometric not working
- Check device has Face ID/fingerprint
- Ensure biometric is enrolled in device settings
- Enable biometric in app Profile settings
- Restart app

### Microphone not working (Voice Notes)
- Grant microphone permission when prompted
- Check device permissions in Settings
- Restart app

## Performance Tips

1. **Use physical device** for best performance (simulators are slower)
2. **Enable biometric** for faster login
3. **Keep app updated** for latest features
4. **Clear cache** if experiencing slowness

## Development

### Hot Reload
- Shake device or press `r` in terminal to reload
- Changes appear automatically

### Debug Menu
- Shake device or `Cmd+D` (iOS) / `Cmd+M` (Android)
- Enable Remote JS Debugging

### View Logs
```bash
# iOS
npx react-native log-ios

# Android
npx react-native log-android
```

## Building for Production

### iOS
```bash
npm install -g eas-cli
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

## Support

### Documentation
- Main docs: `/Users/danperry/Desktop/Dermatology program/derm-app/mobile/MOBILE_APP_COMPLETE.md`
- Backend API: `/Users/danperry/Desktop/Dermatology program/derm-app/backend/README.md`

### Common Endpoints
- Backend: `http://localhost:4000`
- Health check: `http://localhost:4000/health`
- API docs: `http://localhost:4000/api-docs`

### Testing Accounts
Create test accounts in the backend or use default accounts above.

---

**Need Help?**
- Check MOBILE_APP_COMPLETE.md for detailed documentation
- Review error messages in terminal/console
- Check backend logs for API errors
