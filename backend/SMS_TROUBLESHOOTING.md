# SMS Troubleshooting Guide

## Message Information
- **Message SID**: YOUR_TWILIO_MESSAGE_SID
- **Status**: queued
- **To**: +15412318693
- **From**: +19807371319
- **Account**: Trial ($14.35 remaining)
- **Recipient Status**: Verified in Twilio console

## How to Check Message Status

You have three options to check the message status:

### Option 1: Node.js Script (Recommended)
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
node check_sms_status.js
```

This will show:
- Current message status
- Error codes (if any)
- Recent message history
- Account connection status

### Option 2: TypeScript Script
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
npx ts-node scripts/check-message-status.ts
```

### Option 3: Direct API Call (curl)
```bash
cd /Users/danperry/Desktop/Dermatology\ program/derm-app/backend
chmod +x check_sms_curl.sh
./check_sms_curl.sh
```

Or directly:
```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages/$TWILIO_MESSAGE_SID.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

## Understanding Message Status

### Status Progression
Normal message flow:
```
queued → sending → sent → delivered
```

### Status Meanings

| Status | Meaning | What to do |
|--------|---------|------------|
| **queued** | Message is in Twilio's queue | Wait 30-60 seconds, check again |
| **sending** | Being sent to carrier | Wait, should progress to "sent" quickly |
| **sent** | Carrier accepted the message | Wait 1-2 minutes for delivery |
| **delivered** | Successfully delivered | Message received! |
| **undelivered** | Could not be delivered | Check error code, verify phone number |
| **failed** | Failed to send | Check error code |

## Common Issues and Solutions

### Issue 1: Message Stuck in "queued" or "sent"
**Cause**: Message delivery can take 1-5 minutes, sometimes longer

**Solutions**:
- Wait 2-3 minutes and check status again
- SMS delivery timing varies by carrier
- Trial account messages may have slight delays

### Issue 2: Message shows "undelivered"
**Possible Causes**:
- Phone is turned off or out of service area
- Invalid phone number
- Carrier blocking the message
- Phone number is a landline (cannot receive SMS)

**Solutions**:
- Verify the phone number is correct: +15412318693
- Check if the phone is on and has service
- Try sending to a different verified number
- Check Twilio error code for specific issue

### Issue 3: Trial Account Limitations
**Trial Account Restrictions**:
- Can only send to verified phone numbers
- Messages prefixed with "Sent from your Twilio trial account"
- Limited to verified destinations

**To Verify a Number**:
1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
2. Click "Add a new number"
3. Enter the phone number
4. Complete verification process

### Issue 4: Message blocked or filtered
**Error Codes to Check**:
- **21608**: Unverified number (trial account)
- **30003**: Unreachable destination
- **30004**: Message blocked by carrier
- **30007**: Filtered as spam

**Solutions**:
- Verify the number (for trial accounts)
- Check message content for spam triggers
- Try a simpler message without links

## Error Code Reference

### Common Error Codes
| Code | Meaning | Solution |
|------|---------|----------|
| 21211 | Invalid phone number format | Use E.164: +1XXXXXXXXXX |
| 21608 | Unverified number (trial) | Verify at Twilio console |
| 30003 | Unreachable destination | Check number is valid and active |
| 30004 | Blocked by carrier | Carrier rejected the message |
| 30005 | Unknown destination | Invalid phone number |
| 30006 | Landline/unreachable | Number cannot receive SMS |
| 30007 | Spam filter | Message flagged as spam |

Full error reference: https://www.twilio.com/docs/api/errors

## Debugging Steps

### Step 1: Check Current Status
Run the check script:
```bash
node check_sms_status.js
```

Look for:
- Current status (queued, sent, delivered, etc.)
- Any error codes
- Timestamp of last update

### Step 2: Verify Configuration
Check that credentials are correct:
```bash
cat .env | grep TWILIO
```

Should show:
- TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
- TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
- TWILIO_MESSAGE_SID=YOUR_TWILIO_MESSAGE_SID

### Step 3: Check Account Status
The check script will also test your Twilio account connection and show:
- Account name
- Account status
- Whether credentials are valid

### Step 4: Check Twilio Console
Go to: https://console.twilio.com/us1/monitor/logs/sms

This shows:
- Real-time SMS logs
- Delivery status
- Error details
- Message timeline

### Step 5: Send a Test Message
Try sending a new test message:
```bash
npx ts-node scripts/test-twilio-sms.ts +15412318693 "Test message"
```

## Expected Behavior

### For Trial Accounts
1. Message is queued immediately (status: "queued")
2. Message is sent within 5-30 seconds (status: "sent")
3. Carrier confirms delivery within 1-5 minutes (status: "delivered")
4. Message appears on phone with prefix: "Sent from your Twilio trial account - [your message]"

### Delivery Timing
- **Queued to Sent**: 5-30 seconds
- **Sent to Delivered**: 30 seconds to 5 minutes
- **Total Time**: Usually under 2 minutes, can be up to 10 minutes

## Next Steps

1. **Run the check script** to see current status:
   ```bash
   node check_sms_status.js
   ```

2. **If still queued/sent after 5 minutes**:
   - Check Twilio console logs
   - Verify phone has service
   - Try sending to a different number

3. **If undelivered or failed**:
   - Check error code in the output
   - Verify phone number format
   - Ensure recipient number is verified (trial accounts)

4. **If delivered but not received**:
   - Check phone's spam/blocked messages
   - Verify phone number is correct
   - Check phone has signal

## Contact Twilio Support

If the issue persists:
1. Go to: https://support.twilio.com
2. Provide Message SID: YOUR_TWILIO_MESSAGE_SID
3. Include the output from the check script

## Additional Resources

- Twilio SMS Quickstart: https://www.twilio.com/docs/sms/quickstart
- SMS Delivery Best Practices: https://www.twilio.com/docs/sms/tutorials/how-to-confirm-delivery
- Error Code Reference: https://www.twilio.com/docs/api/errors
- Message Logs: https://console.twilio.com/us1/monitor/logs/sms
