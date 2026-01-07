#!/bin/bash

# Check SMS Status using Twilio REST API with curl
# This is a backup method that doesn't require Node.js

ACCOUNT_SID="${TWILIO_ACCOUNT_SID}"
AUTH_TOKEN="${TWILIO_AUTH_TOKEN}"
MESSAGE_SID="${TWILIO_MESSAGE_SID}"

if [ -z "$ACCOUNT_SID" ] || [ -z "$AUTH_TOKEN" ] || [ -z "$MESSAGE_SID" ]; then
  echo "Missing Twilio env vars. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGE_SID."
  exit 1
fi

echo ""
echo "📱 Checking SMS Message Status via Twilio API"
echo "=============================================="
echo ""
echo "Message SID: $MESSAGE_SID"
echo "Account SID: $ACCOUNT_SID"
echo ""
echo "Fetching from Twilio API..."
echo ""

# Make the API request
curl -s -X GET "https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID/Messages/$MESSAGE_SID.json" \
  -u "$ACCOUNT_SID:$AUTH_TOKEN" | python3 -m json.tool

echo ""
echo "=================================="
echo ""
echo "Status meanings:"
echo "  queued     - Message is queued and will be sent shortly"
echo "  sending    - Message is being sent to carrier"
echo "  sent       - Message sent to carrier (delivery in progress)"
echo "  delivered  - Message successfully delivered"
echo "  undelivered - Could not be delivered"
echo "  failed     - Failed to send"
echo ""
