# Mobile App Installation & Testing Checklist

## Step 1: Install Dependencies

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/mobile
npm install
```

**Expected Result**: All dependencies install without errors
**Troubleshooting**: If errors occur, try `rm -rf node_modules && npm install`

## Step 2: Start Backend

```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npm run dev
```

**Expected Result**: Backend running on `http://localhost:4000`
**Verify**: Open `http://localhost:4000/health` in browser - should show success message

## Step 3: Configure Environment (Optional)

Only needed if testing on physical device:

1. Get your computer's IP:
   ```bash
   ipconfig getifaddr en0
   # e.g., 192.168.1.100
   ```

2. Update `/Users/danperry/Desktop/Dermatology program/derm-app/mobile/src/config/environment.ts`:
   ```typescript
   dev: {
     apiUrl: 'http://192.168.1.100:4000', // Use your IP
     name: 'Development',
   }
   ```

## Step 4: Start Mobile App

### Option A: iOS Simulator (Mac Only)
```bash
npm run ios
```

### Option B: Android Emulator
```bash
npm run android
```

### Option C: Physical Device (Recommended)
```bash
npm start
```
Then scan QR code with Expo Go app

**Expected Result**: Metro bundler starts, app loads on device/simulator

## Step 5: Test Login

### Patient Account
- Email: `patient@example.com`
- Password: `password123`

### Provider Account
- Email: `doctor@example.com`
- Password: `password123`

**Expected Result**: Successfully logs in, shows appropriate dashboard

## Step 6: Test Patient Features

- [ ] **Home Screen**
  - [ ] Dashboard loads with widgets
  - [ ] Can see quick actions
  - [ ] Navigation tabs visible

- [ ] **Appointments**
  - [ ] List loads (may be empty)
  - [ ] Can tap "+" button
  - [ ] Pull to refresh works

- [ ] **Messages**
  - [ ] Message list loads
  - [ ] Can tap compose button
  - [ ] Unread indicators show

- [ ] **Bills**
  - [ ] Bills list loads
  - [ ] Can see totals
  - [ ] Pay button visible

- [ ] **Profile**
  - [ ] User info displays
  - [ ] Settings accessible
  - [ ] Can logout

## Step 7: Test Provider Features

- [ ] **Home Screen**
  - [ ] Today's stats display
  - [ ] Upcoming appointments show
  - [ ] Quick actions work

- [ ] **Schedule**
  - [ ] Date selector works
  - [ ] Appointments load
  - [ ] Can switch dates

- [ ] **Patients**
  - [ ] Search box functional
  - [ ] Search returns results
  - [ ] Patient cards display

- [ ] **Notes**
  - [ ] Notes list loads
  - [ ] Microphone button works
  - [ ] Can access AI notes

## Step 8: Test Advanced Features

- [ ] **Biometric Auth**
  - [ ] Go to Profile → Security
  - [ ] Toggle biometric on
  - [ ] Logout and login with biometric

- [ ] **Auto-Logout**
  - [ ] Wait 15 minutes (or reduce timeout in code for testing)
  - [ ] App logs out automatically

- [ ] **Offline Mode**
  - [ ] Turn off WiFi
  - [ ] Try to make requests
  - [ ] Turn WiFi back on
  - [ ] Verify requests sync

- [ ] **Push Notifications** (Physical Device Only)
  - [ ] Grant notification permissions
  - [ ] Token registers with backend
  - [ ] Test receiving notifications

## Step 9: Test AI Voice Notes (Provider)

- [ ] Tap microphone icon on home
- [ ] Grant microphone permission
- [ ] Record test audio (30+ seconds)
- [ ] Stop and process
- [ ] Verify transcript appears
- [ ] Generate clinical note
- [ ] Review and edit note
- [ ] Approve and save

## Common Issues & Solutions

### "Cannot connect to backend"
**Solution**:
1. Verify backend is running: `http://localhost:4000/health`
2. For physical device, update IP in environment.ts
3. Check firewall settings
4. Ensure same WiFi network

### "Metro bundler error"
**Solution**:
```bash
npx expo start -c
```

### "Build failed"
**Solution**:
```bash
rm -rf node_modules
npm install
```

### Biometric not working
**Solution**:
1. Check device has Face ID/fingerprint
2. Ensure enrolled in device settings
3. Enable in app Profile settings
4. Restart app

### Microphone not working
**Solution**:
1. Grant permission when prompted
2. Check Settings → Derm EHR → Microphone
3. Restart app

### Slow performance
**Solution**:
1. Use physical device (simulators are slower)
2. Clear cache: `npx expo start -c`
3. Close other apps

## Development Tips

### Hot Reload
- Changes auto-reload on save
- Shake device to open dev menu
- Press 'r' in terminal to reload

### Debug Menu
- Shake device
- Or `Cmd+D` (iOS) / `Cmd+M` (Android)
- Enable Remote JS Debugging

### View Logs
```bash
# iOS
npx react-native log-ios

# Android
npx react-native log-android
```

### Clear Everything
```bash
rm -rf node_modules
npm install
npx expo start -c
```

## Next Steps After Testing

1. **Create Test Accounts** in backend if needed
2. **Configure Push Notifications** with Expo project ID
3. **Test on Multiple Devices** (iOS and Android)
4. **Review Backend Logs** for any API errors
5. **Update Environment** for staging/production

## Production Deployment Checklist

Before deploying to App/Play Store:

- [ ] Update bundle identifier in `app.json`
- [ ] Configure production API URL
- [ ] Set up Apple Developer account
- [ ] Set up Google Play Developer account
- [ ] Build with EAS: `eas build --platform ios`
- [ ] Build with EAS: `eas build --platform android`
- [ ] Test builds on physical devices
- [ ] Submit to stores

## Documentation Reference

- **Quick Start**: QUICKSTART_GUIDE.md
- **Full Documentation**: MOBILE_APP_COMPLETE.md
- **Implementation Details**: IMPLEMENTATION_SUMMARY.md
- **Backend API**: ../backend/README.md

## Support

If you encounter issues:
1. Check error messages in terminal/console
2. Review backend logs
3. Check this checklist
4. Review documentation files above

---

**Good luck with testing!**
