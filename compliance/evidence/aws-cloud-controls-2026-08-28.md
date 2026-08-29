# AWS BAA and Cloud-Control Evidence

Verified: 2026-08-29 UTC

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

## Verified production backup and restore drill

- GitHub Actions workflow run: `33226411040` (`https://github.com/Dan40000000/dermatology-ehr/actions/runs/33226411040`).
- Backup job: `99030931073` (`https://github.com/Dan40000000/dermatology-ehr/actions/runs/33226411040/job/99030931073`).
- Exact source commit: `108c7249418064a23f512caac3c35847845e56e8` on `codex/emr-phi-readiness-hardening`.
- The job ran from `2026-08-29T01:26:27Z` through `2026-08-29T01:33:04Z` and completed successfully.
- GitHub assumed `arn:aws:iam::213598696247:role/dermatology-ehr-github-production-backup` through OIDC. Its trust policy restricts the subject to `repo:Dan40000000/dermatology-ehr:environment:production`, and its inline policy `dermatology-ehr-production-backup-s3` grants only list/location access to the dedicated bucket and object access under `backups/*`.
- The protected GitHub `production` environment contains `AWS_BACKUP_ROLE_ARN`, `AWS_REGION`, `DATABASE_URL`, `BACKUP_BUCKET`, and `BACKUP_ENCRYPTION_KEY`; no secret values are stored in this evidence file. The application encryption key is separately escrowed in Apple Keychain.
- The successful run created `backups/2026-08-29/derm_db_backup_20260829_012712.sql.gz.enc` (4,978,768 bytes), verified it in S3, and restored it into the workflow's disposable PostgreSQL 18 service.
- An AWS `HeadObject` check returned `ServerSideEncryption: aws:kms`, KMS key ID `arn:aws:kms:us-east-1:213598696247:key/b21cbd69-0071-43bb-820f-2d0654f3fd40`, content length `4978768`, and last-modified time `2026-08-29T01:32:55Z`.
- The first attempt, run `33226276592` / job `99030556729`, failed before producing a dump because its PostgreSQL 16 client refused a PostgreSQL 18 server. Commit `108c7249418064a23f512caac3c35847845e56e8` aligned the backup client and disposable restore service to PostgreSQL 18 before the successful rerun.
- The platform owner states that no real patient data is currently present in production. This drill does not authorize live PHI.

## Remaining verification

- Enable and verify MFA for privileged AWS access and establish CloudTrail/log review according to the security program.

## Public references

- https://aws.amazon.com/compliance/hipaa-eligible-services-reference/
- https://aws.amazon.com/healthscribe/
- https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/specifying-kms-encryption.html
