require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messageSid = process.env.TWILIO_MESSAGE_SID;

if (!accountSid || !authToken || !messageSid) {
    console.error('Missing Twilio env vars. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGE_SID.');
    process.exit(1);
}

const client = twilio(accountSid, authToken);

// Error code explanations
const errorExplanations = {
    21211: 'Invalid "To" Phone Number - Use E.164 format: +1XXXXXXXXXX',
    21408: 'Permission to send to this region has not been enabled',
    21601: 'Phone number is not a valid SMS-capable number',
    21608: 'Unverified number (Trial Account) - Verify at: https://console.twilio.com/us1/develop/phone-numbers/manage/verified',
    21610: 'Message blocked - Unsubscribed recipient',
    30001: 'Queue overflow - Message could not be queued',
    30002: 'Account suspended',
    30003: 'Unreachable destination - Phone number not reachable',
    30004: 'Message blocked by carrier',
    30005: 'Unknown destination - Invalid phone number',
    30006: 'Landline or unreachable carrier',
    30007: 'Message filtered (spam)',
    30008: 'Unknown error',
};

async function checkMessageStatus() {
    try {
        console.log('\n📱 Checking SMS Message Status');
        console.log('================================\n');
        console.log('Message SID:', messageSid);
        console.log('Account SID:', accountSid);
        console.log('\n');

        // Get the specific message
        console.log('Fetching message details from Twilio API...\n');
        const message = await client.messages(messageSid).fetch();

        console.log('MESSAGE DETAILS:');
        console.log('================');
        console.log('Status:        ', message.status);
        console.log('To:            ', message.to);
        console.log('From:          ', message.from);
        console.log('Body:          ', message.body || '(empty)');
        console.log('Segments:      ', message.numSegments || 1);
        console.log('Price:         ', message.price || 'N/A', message.priceUnit || '');
        console.log('Direction:     ', message.direction);
        console.log('Date Created:  ', message.dateCreated);
        console.log('Date Sent:     ', message.dateSent || 'Not sent yet');
        console.log('Date Updated:  ', message.dateUpdated);
        console.log('Error Code:    ', message.errorCode || 'None');
        console.log('Error Message: ', message.errorMessage || 'None');
        console.log('\n');

        // Check for errors
        if (message.errorCode) {
            console.log('❌ ERROR DETECTED:');
            console.log('==================');
            console.log('Error Code:    ', message.errorCode);
            console.log('Error Message: ', message.errorMessage);
            console.log('\n');

            if (errorExplanations[message.errorCode]) {
                console.log('Explanation:');
                console.log(errorExplanations[message.errorCode]);
            }
            console.log('\n');
        } else {
            // Explain status
            switch (message.status) {
                case 'queued':
                    console.log('⏳ Status: QUEUED');
                    console.log('The message is in Twilio\'s queue and will be sent shortly.');
                    console.log('This is normal - messages usually move to "sent" within seconds.');
                    break;
                case 'sending':
                    console.log('⏳ Status: SENDING');
                    console.log('The message is currently being sent to the carrier.');
                    break;
                case 'sent':
                    console.log('✅ Status: SENT');
                    console.log('The message has been sent to the carrier.');
                    console.log('Note: "sent" means carrier accepted it, delivery may still be in progress.');
                    break;
                case 'delivered':
                    console.log('✅ Status: DELIVERED');
                    console.log('The message was successfully delivered to the recipient!');
                    break;
                case 'undelivered':
                    console.log('⚠️  Status: UNDELIVERED');
                    console.log('The message could not be delivered. Possible reasons:');
                    console.log('  - Phone is turned off or out of service');
                    console.log('  - Invalid phone number');
                    console.log('  - Carrier blocking the message');
                    break;
                case 'failed':
                    console.log('❌ Status: FAILED');
                    console.log('The message failed to send.');
                    break;
                default:
                    console.log('Status:', message.status);
            }
            console.log('\n');
        }

        // Fetch recent messages for context
        console.log('RECENT MESSAGES (Last 5):');
        console.log('=========================');
        const messages = await client.messages.list({ limit: 5 });

        messages.forEach((msg, index) => {
            const isCurrent = msg.sid === messageSid;
            console.log(`${index + 1}. ${isCurrent ? '>>> ' : '    '}${msg.sid.substring(0, 20)}...`);
            console.log(`   Status: ${msg.status}${isCurrent ? ' (THIS MESSAGE)' : ''}`);
            console.log(`   To:     ${msg.to}`);
            console.log(`   From:   ${msg.from}`);
            console.log(`   Date:   ${msg.dateCreated}`);
            if (msg.errorCode) {
                console.log(`   Error:  ${msg.errorCode} - ${msg.errorMessage}`);
            }
            console.log('');
        });

        // Test account connection
        console.log('Testing Twilio account connection...');
        const account = await client.api.accounts(accountSid).fetch();
        console.log('✅ Connected to Twilio account:', account.friendlyName);
        console.log('Account Status:', account.status);
        console.log('\n');

        console.log('📝 Status Progression: queued → sending → sent → delivered');
        console.log('\n💡 If message is still "queued" or "sent", wait 1-2 minutes and check again.\n');

    } catch (error) {
        console.error('\n❌ Error fetching message status:');
        console.error('==================================');
        console.error('Error Code:   ', error.code);
        console.error('Error Message:', error.message);
        console.error('Status:       ', error.status);

        if (error.code === 20404) {
            console.error('\n⚠️  Message not found!');
            console.error('The message SID may be incorrect or the message may not exist.');
            console.error('Provided SID:', messageSid);
        } else if (error.code === 20003) {
            console.error('\n⚠️  Authentication failed!');
            console.error('Check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
        }

        if (error.moreInfo) {
            console.error('More Info:    ', error.moreInfo);
        }
        console.error('\n');
    }
}

checkMessageStatus();
