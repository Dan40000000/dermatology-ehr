# AWS BAA and Cloud-Control Evidence

Verified: 2026-08-28

AWS account: `213598696247`

## Agreement and service scope

- The standard AWS Business Associate Addendum is active in AWS Artifact for this account, effective 2026-08-28.
- The confidential agreement PDF is retained outside source control at `/Users/danperry/Documents/EMR System/compliance/evidence/aws/AWS-Business-Associate-Addendum-2026-08-28.pdf` with owner-only filesystem permissions.
- The AWS HIPAA Eligible Services Reference, last updated 2026-07-14 when reviewed, lists Amazon S3, AWS KMS, and AWS Transcribe including HealthScribe.
- AWS HealthScribe's official service documentation states that it is HIPAA eligible and does not retain inbound audio or output text; customer-controlled S3 input and output remain the platform owner's responsibility.

## Verified S3 controls

| Bucket | Purpose | Encryption | Lifecycle |
| --- | --- | --- | --- |
| `dermehr-healthscribe-input-213598696247` | Temporary recorded-encounter audio | S3 server-side encryption | Enabled rule `healthscribe-input-delete-after-1-day`: expire current objects after 1 day and abort incomplete multipart uploads after 1 day |
| `dermehr-healthscribe-output-213598696247` | Temporary transcript and clinical-document output | S3 server-side encryption | Enabled rule `healthscribe-output-delete-after-1-day`: expire current objects after 1 day and abort incomplete multipart uploads after 1 day |
| `dermehr-database-backups-213598696247` | Separate database backups | SSE-KMS using `arn:aws:kms:us-east-1:213598696247:alias/aws/s3`, with S3 Bucket Key enabled | Enabled rule `database-backups-delete-after-90-days`: expire current objects after 90 days and abort incomplete multipart uploads after 1 day |

All three buckets have S3 Block Public Access enabled. Bucket versioning is disabled; backup object names are timestamped so scheduled backups do not overwrite prior objects.

## Application and operational controls

- The pending application change deletes the temporary HealthScribe input object on success, provider failure, timeout, or startup failure.
- It deletes returned transcript and clinical-document objects after importing output into the EHR.
- Cleanup logs contain only provider, object type, correlation ID, and a scrubbed error code; object URIs, patient-derived filenames, and transcript payloads are not logged.
- The one-day lifecycle rules are a backstop for process interruption or cleanup permission failure, not the primary retention mechanism.
- The backup workflow creates an application-encrypted database dump, uploads it with SSE-KMS, retains it for 90 days, and restores it into a disposable PostgreSQL instance before a run is considered successful.

## Remaining verification

- Create a least-privilege GitHub OIDC role for the production backup workflow; do not issue a long-lived AWS access key.
- Store the role ARN, Railway production database URL, and application backup-encryption passphrase as GitHub production-environment secrets.
- Run the workflow successfully against the production database while it contains synthetic/no patient data, retain the GitHub run URL as restore evidence, and verify the uploaded object's SSE-KMS metadata.
- Enable and verify MFA for privileged AWS access and establish CloudTrail/log review according to the security program.

## Public references

- https://aws.amazon.com/compliance/hipaa-eligible-services-reference/
- https://aws.amazon.com/healthscribe/
- https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/specifying-kms-encryption.html
