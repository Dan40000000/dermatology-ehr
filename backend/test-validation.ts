import { z } from 'zod';

const makePaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.string().uuid().optional(),
  chargeIds: z.array(z.string().uuid()).optional(),
  description: z.string().optional(),
  savePaymentMethod: z.boolean().default(false),
  newPaymentMethod: z.object({
    paymentType: z.enum(['credit_card', 'debit_card']),
    cardNumber: z.string(),
    cardBrand: z.string(),
    expiryMonth: z.number(),
    expiryYear: z.number(),
    cardholderName: z.string(),
    cvv: z.string(),
    billingAddress: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default('US'),
    }),
  }).optional(),
});

const validPaymentWithExisting = {
  amount: 100.0,
  paymentMethodId: "00000000-0000-0000-0000-000000000001",
  description: "Payment for office visit",
};

try {
  const result = makePaymentSchema.parse(validPaymentWithExisting);
  console.log('Valid!', result);
} catch (error) {
  console.log('Invalid!', JSON.stringify(error, null, 2));
}
