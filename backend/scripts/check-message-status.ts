/**
 * Check SMS Message Status
 *
 * This script checks the status of a specific SMS message using the Twilio API
 * and displays detailed information about delivery status and any errors.
 *
 * Usage: npx ts-node scripts/check-message-status.ts <MESSAGE_SID>
 */

import 'dotenv/config';
import { getTwilioServiceFromEnv } from '../src/services/twilioService';

const MESSAGE_SID = process.argv[2] || 'SMe73b9b3813e3dd8dba8a952909447d7f';

async function checkMessageStatus() {
  console.log('\n📱 Checking SMS Message Status');
  console.log('================================\n');
  console.log(`Message SID: ${MESSAGE_SID}\n`);

  try {
    // Get Twilio service
    const twilioService = getTwilioServiceFromEnv();

    // Fetch message details
    console.log('Fetching message details from Twilio API...\n');
    const message = await twilioService.getMessageDetails(MESSAGE_SID);

    // Display comprehensive message information
    console.log('MESSAGE DETAILS:');
    console.log('================');
    console.log(`Status:         ${message.status}`);
    console.log(`To:             ${message.to}`);
    console.log(`From:           ${message.from}`);
    console.log(`Body:           ${message.body || '(empty)'}`);
    console.log(`Segments:       ${message.numSegments || 1}`);
    console.log(`Price:          ${message.price || 'N/A'}`);
    console.log(`Date Created:   ${message.dateCreated}`);
    console.log(`Date Sent:      ${message.dateSent || 'Not sent yet'}`);
    console.log(`Date Updated:   ${message.dateUpdated}`);
    console.log('');

    // Check for errors
    if (message.errorCode) {
      console.log('❌ ERROR DETECTED:');
      console.log('==================');
      console.log(`Error Code:     ${message.errorCode}`);
      console.log(`Error Message:  ${message.errorMessage}`);
      console.log('');

      // Provide helpful information about common error codes
      explainErrorCode(message.errorCode);
    } else if (message.status === 'failed') {
      console.log('❌ Message Status: FAILED');
      console.log('The message failed to send but no error code was provided.');
      console.log('');
    } else if (message.status === 'undelivered') {
      console.log('⚠️  Message Status: UNDELIVERED');
      console.log('The message was sent but could not be delivered to the recipient.');
      console.log('This could be due to:');
      console.log('  - Phone is turned off or out of service');
      console.log('  - Invalid phone number');
      console.log('  - Carrier blocking the message');
      console.log('');
    } else if (message.status === 'queued' || message.status === 'sending') {
      console.log('⏳ Message Status: IN PROGRESS');
      console.log(`The message is currently ${message.status}.`);
      console.log('This is normal and the message should be delivered soon.');
      console.log('');
      console.log('💡 Tips:');
      console.log('  - SMS delivery can take a few seconds to a few minutes');
      console.log('  - Check your phone again in 1-2 minutes');
      console.log('  - Run this script again to see updated status');
      console.log('');
    } else if (message.status === 'sent') {
      console.log('✅ Message Status: SENT');
      console.log('The message has been sent to the carrier.');
      console.log('');
      console.log('💡 Note: "sent" means the carrier accepted it, but delivery may still be in progress.');
      console.log('');
    } else if (message.status === 'delivered') {
      console.log('✅ Message Status: DELIVERED');
      console.log('The message was successfully delivered to the recipient!');
      console.log('');
    }

    // Display status history note
    console.log('📝 Status Progression:');
    console.log('  queued → sending → sent → delivered');
    console.log('');

    // Test connection
    console.log('Testing Twilio connection...');
    const connectionTest = await twilioService.testConnection();
    if (connectionTest.success) {
      console.log(`✅ Connected to Twilio account: ${connectionTest.accountName}`);
    } else {
      console.log(`❌ Connection test failed: ${connectionTest.error}`);
    }
    console.log('');

    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (messagingServiceSid) {
      try {
        const service = await (twilioService as any).client.messaging.v1
          .services(messagingServiceSid)
          .fetch();
        console.log('📡 Messaging Service Compliance:');
        console.log(`  Service SID: ${messagingServiceSid}`);
        console.log(`  US A2P registered: ${service.usAppToPersonRegistered ? 'yes' : 'no'}`);
        console.log('');
      } catch (serviceError: any) {
        console.log('⚠️  Could not fetch Messaging Service compliance status.');
        console.log(`   ${serviceError.message}`);
        console.log('');
      }
    }

  } catch (error: any) {
    console.log('\n❌ Error fetching message status:');
    console.log('==================================');
    console.log(`Error: ${error.message}`);

    if (error.code === 20404) {
      console.log('\n⚠️  Message not found!');
      console.log('The message SID may be incorrect or the message may not exist.');
      console.log(`Provided SID: ${MESSAGE_SID}`);
    } else if (error.code === 20003) {
      console.log('\n⚠️  Authentication failed!');
      console.log('Check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
    }

    console.log('');
    process.exit(1);
  }
}

/**
 * Explain common Twilio error codes
 */
function explainErrorCode(errorCode: number) {
  const errorExplanations: Record<number, string> = {
    21211: '❌ Invalid "To" Phone Number\n   The phone number format is invalid. Use E.164 format: +1XXXXXXXXXX',
    21408: '❌ Permission to send to this region has not been enabled\n   You may need to enable geo permissions in your Twilio console.',
    21601: '❌ Phone number is not a valid SMS-capable number\n   The number may be a landline or VoIP number that cannot receive SMS.',
    21608: '❌ Unverified number (Trial Account)\n   Trial accounts can only send to verified numbers.\n   Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified',
    21610: '❌ Message blocked - Unsubscribed recipient\n   The recipient has opted out of receiving messages from this number.',
    30001: '❌ Queue overflow - Message could not be queued\n   Twilio\'s message queue is full. Try again in a few moments.',
    30002: '❌ Account suspended\n   Your Twilio account has been suspended. Contact Twilio support.',
    30003: '❌ Unreachable destination\n   The phone number is not reachable or does not exist.',
    30004: '❌ Message blocked\n   The message was blocked by the carrier.',
    30005: '❌ Unknown destination\n   The destination phone number is invalid or unknown.',
    30006: '❌ Landline or unreachable carrier\n   The number is a landline or the carrier cannot be reached.',
    30007: '❌ Message filtered (spam)\n   The carrier flagged this message as spam.',
    30008: '❌ Unknown error\n   An unknown error occurred. Contact Twilio support.',
    30034: '❌ US A2P 10DLC compliance failure\n   Register a brand + campaign and attach this sender before sending US messages.',
  };

  if (errorExplanations[errorCode]) {
    console.log(errorExplanations[errorCode]);
  } else {
    console.log(`Unknown error code: ${errorCode}`);
    console.log('Check Twilio documentation for more information:');
    console.log('https://www.twilio.com/docs/api/errors');
  }
  console.log('');
}

// Run the check
checkMessageStatus();
