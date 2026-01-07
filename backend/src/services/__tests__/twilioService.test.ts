import { TwilioService, createTwilioService, getTwilioServiceFromEnv } from '../twilioService';
import { validateAndFormatPhone } from '../../utils/phone';
import { logger } from '../../lib/logger';

var twilioMock: jest.Mock;
var validateRequestMock: jest.Mock;
var messagesCreateMock: jest.Mock;
var messagesFetchMock: jest.Mock;
var incomingListMock: jest.Mock;
var accountsFetchMock: jest.Mock;

jest.mock('twilio', () => {
  messagesCreateMock = jest.fn();
  messagesFetchMock = jest.fn();
  incomingListMock = jest.fn();
  accountsFetchMock = jest.fn();
  validateRequestMock = jest.fn();

  const messagesFn = Object.assign(
    (sid: string) => ({ fetch: messagesFetchMock }),
    { create: messagesCreateMock },
  );

  twilioMock = jest.fn(() => ({
    messages: messagesFn,
    api: {
      accounts: jest.fn(() => ({ fetch: accountsFetchMock })),
    },
    incomingPhoneNumbers: {
      list: incomingListMock,
    },
  }));
  (twilioMock as any).validateRequest = validateRequestMock;

  return { __esModule: true, default: twilioMock };
});

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../utils/phone', () => ({
  formatPhoneE164: jest.fn((value) => value),
  validateAndFormatPhone: jest.fn((value) => `+1${value}`),
}));

const validateMock = validateAndFormatPhone as jest.Mock;

describe('TwilioService', () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    messagesFetchMock.mockReset();
    incomingListMock.mockReset();
    accountsFetchMock.mockReset();
    validateRequestMock.mockReset();
    validateMock.mockClear();
    (logger.info as jest.Mock).mockReset();
    (logger.error as jest.Mock).mockReset();
  });

  it('requires credentials on construction', () => {
    expect(() => new TwilioService('', '')).toThrow('Twilio credentials are required');
  });

  it('sends SMS messages through Twilio', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      sid: 'msg-1',
      status: 'queued',
      numSegments: '2',
      price: '0.02',
      errorCode: null,
      errorMessage: null,
    });

    const service = new TwilioService('sid', 'token');
    const result = await service.sendSMS({
      to: '5550001',
      from: '5550002',
      body: 'Hello there',
    });

    expect(validateMock).toHaveBeenCalledWith('5550001');
    expect(validateMock).toHaveBeenCalledWith('5550002');
    expect(messagesCreateMock).toHaveBeenCalledWith({
      to: '+15550001',
      from: '+15550002',
      body: 'Hello there',
      mediaUrl: undefined,
      statusCallback: undefined,
    });
    expect(result).toEqual({
      sid: 'msg-1',
      status: 'queued',
      to: '+15550001',
      from: '+15550002',
      body: 'Hello there',
      numSegments: 2,
      price: '0.02',
      errorCode: undefined,
      errorMessage: undefined,
    });
  });

  it('surfaces Twilio failures when sending SMS', async () => {
    messagesCreateMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '123', status: 500 }));

    const service = new TwilioService('sid', 'token');
    await expect(
      service.sendSMS({
        to: '5550001',
        from: '5550002',
        body: 'Hello there',
      }),
    ).rejects.toThrow('Failed to send SMS: boom');
  });

  it('fills appointment reminder templates', async () => {
    const service = new TwilioService('sid', 'token');
    const sendSpy = jest.spyOn(service, 'sendSMS').mockResolvedValue({
      sid: 'msg-2',
      status: 'queued',
      to: '+15550001',
      from: '+15550002',
      body: 'body',
      numSegments: 1,
    });

    await service.sendAppointmentReminder(
      '5550002',
      {
        patientPhone: '5550001',
        patientName: 'Pat',
        providerName: 'Dr. Smith',
        appointmentDate: 'Jan 10',
        appointmentTime: '9:00 AM',
        clinicPhone: '5551234',
        template: 'Hi {patientName}, see {providerName} on {appointmentDate} at {appointmentTime}. Call {clinicPhone}.',
      },
      'https://callback.test',
    );

    expect(sendSpy).toHaveBeenCalledWith({
      to: '5550001',
      from: '5550002',
      body: 'Hi Pat, see Dr. Smith on Jan 10 at 9:00 AM. Call 5551234.',
      statusCallback: 'https://callback.test',
    });
  });

  it('validates webhook signatures', () => {
    validateRequestMock.mockReturnValueOnce(true);
    const service = new TwilioService('sid', 'token');

    expect(service.validateWebhookSignature('sig', 'https://url', { a: '1' })).toBe(true);

    validateRequestMock.mockImplementationOnce(() => {
      throw new Error('bad');
    });
    expect(service.validateWebhookSignature('sig', 'https://url', {})).toBe(false);
  });

  it('fetches message details', async () => {
    messagesFetchMock.mockResolvedValueOnce({
      sid: 'msg-3',
      status: 'delivered',
      to: '+15550001',
      from: '+15550002',
      body: 'Hello',
      numSegments: 1,
      price: '0.01',
      errorCode: null,
      errorMessage: null,
      dateCreated: 'created',
      dateSent: 'sent',
      dateUpdated: 'updated',
    });

    const service = new TwilioService('sid', 'token');
    const details = await service.getMessageDetails('msg-3');

    expect(details).toMatchObject({
      sid: 'msg-3',
      status: 'delivered',
      to: '+15550001',
      from: '+15550002',
      body: 'Hello',
      numSegments: 1,
    });
  });

  it('tests connection with Twilio', async () => {
    accountsFetchMock.mockResolvedValueOnce({ friendlyName: 'Clinic' });
    const service = new TwilioService('sid', 'token');
    await expect(service.testConnection()).resolves.toEqual({ success: true, accountName: 'Clinic' });

    accountsFetchMock.mockRejectedValueOnce(new Error('nope'));
    await expect(service.testConnection()).resolves.toEqual({ success: false, error: 'nope' });
  });

  it('fetches phone number info or throws', async () => {
    incomingListMock.mockResolvedValueOnce([
      {
        phoneNumber: '+15550001',
        friendlyName: 'Clinic',
        capabilities: { sms: true },
        smsUrl: 'https://sms',
        statusCallback: 'https://callback',
      },
    ]);

    const service = new TwilioService('sid', 'token');
    await expect(service.getPhoneNumberInfo('5550001')).resolves.toMatchObject({
      phoneNumber: '+15550001',
      friendlyName: 'Clinic',
    });

    incomingListMock.mockResolvedValueOnce([]);
    await expect(service.getPhoneNumberInfo('5550001')).rejects.toThrow('Phone number not found in Twilio account');
  });

  it('calculates segment counts and costs', () => {
    const service = new TwilioService('sid', 'token');

    expect(service.calculateSegmentCount('a'.repeat(161))).toBe(2);
    expect(service.calculateSegmentCount('\u2713'.repeat(71))).toBe(2);
    expect(service.estimateSMSCost('a'.repeat(161))).toBeCloseTo(0.0158, 5);
    expect(service.estimateSMSCost('a', true)).toBeCloseTo(0.02, 5);
  });

  it('creates services from helpers', () => {
    const originalSid = process.env.TWILIO_ACCOUNT_SID;
    const originalToken = process.env.TWILIO_AUTH_TOKEN;

    expect(() => getTwilioServiceFromEnv()).toThrow('Twilio credentials not configured in environment');

    process.env.TWILIO_ACCOUNT_SID = 'sid';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    const service = getTwilioServiceFromEnv();

    expect(service).toBeInstanceOf(TwilioService);
    expect(createTwilioService('sid', 'token')).toBeInstanceOf(TwilioService);

    if (originalSid === undefined) {
      delete process.env.TWILIO_ACCOUNT_SID;
    } else {
      process.env.TWILIO_ACCOUNT_SID = originalSid;
    }
    if (originalToken === undefined) {
      delete process.env.TWILIO_AUTH_TOKEN;
    } else {
      process.env.TWILIO_AUTH_TOKEN = originalToken;
    }
  });
});
