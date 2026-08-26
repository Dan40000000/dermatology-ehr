-- Replace only the legacy seeded recall messages. Custom practice templates are preserved.
UPDATE recall_campaigns
SET message_template = 'Hi {firstName}, this is {practiceName}. It''s time to schedule your follow-up visit. Reply here or call {clinicPhone} and we''ll help. Reply STOP to opt out.',
    updated_at = NOW()
WHERE trim(coalesce(message_template, '')) IN (
  'Dermatology DEMO Office: You are due for a dermatology follow-up visit. Please call us or reply to schedule. Reply STOP to opt out.',
  'Dermatology DEMO Office: It is time to schedule your annual skin check. Please call us or reply to schedule. Reply STOP to opt out.'
);
