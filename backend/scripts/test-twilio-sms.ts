/**
 * Test Twilio SMS - Quick test script
 *
 * Usage: npx ts-node scripts/test-twilio-sms.ts +1XXXXXXXXXX "Your test message"
 *
 * IMPORTANT: With Twilio trial accounts, you can only send to verified phone numbers!
 * Verify your number at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
 */

import 'dotenv/config';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

async function testSMS() {
  // Get phone number from command line
  const toNumber = process.argv[2];
  const message = process.argv[3] || 'Test message from Derm App - SMS is working!';

  if (!toNumber) {
    console.log('\n❌ Usage: npx ts-node scripts/test-twilio-sms.ts +1XXXXXXXXXX "Your message"');
    console.log('\nExample: npx ts-node scripts/test-twilio-sms.ts +13035551234 "Hello from Derm App!"');
    console.log('\n⚠️  IMPORTANT: With trial accounts, the phone number must be verified first!');
    console.log('   Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified\n');
    process.exit(1);
  }

  console.log('\n🔧 Twilio SMS Test');
  console.log('==================');
  console.log(`Account SID: ${accountSid?.substring(0, 10)}...`);
  console.log(`From Number: ${fromNumber}`);
  console.log(`To Number: ${toNumber}`);
  console.log(`Message: ${message}`);
  console.log('');

  if (!accountSid || !authToken || !fromNumber) {
    console.log('❌ Missing Twilio credentials in .env file');
    console.log('   Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
    process.exit(1);
  }

  try {
    // Import twilio dynamically
    const twilio = await import('twilio');
    const client = twilio.default(accountSid, authToken);

    console.log('📤 Sending SMS...');

    const result = await client.messages.create({
      to: toNumber,
      from: fromNumber,
      body: message,
    });

    console.log('\n✅ SMS Sent Successfully!');
    console.log('========================');
    console.log(`Message SID: ${result.sid}`);
    console.log(`Status: ${result.status}`);
    console.log(`To: ${result.to}`);
    console.log(`From: ${result.from}`);
    console.log(`Segments: ${result.numSegments}`);
    console.log('');
    console.log('💡 Note: Trial accounts prefix messages with "Sent from your Twilio trial account"');
    console.log('');
  } catch (error: any) {
    console.log('\n❌ Failed to send SMS');
    console.log('=====================');
    console.log(`Error: ${error.message}`);

    if (error.code === 21608) {
      console.log('\n⚠️  The phone number is not verified!');
      console.log('   Trial accounts can only send to verified numbers.');
      console.log('   Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
    } else if (error.code === 21211) {
      console.log('\n⚠️  Invalid phone number format.');
      console.log('   Use E.164 format: +1XXXXXXXXXX');
    }

    console.log('');
    process.exit(1);
  }
}

testSMS();
