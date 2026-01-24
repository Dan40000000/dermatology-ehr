#!/bin/bash
# =============================================================================
# LocalStack Initialization Script
# =============================================================================
# This script runs automatically when LocalStack starts.
# It creates the default S3 bucket for development.
# =============================================================================

set -e

echo "=== LocalStack Initialization ==="

# Default bucket name (can be overridden via environment variable)
BUCKET_NAME="${AWS_S3_BUCKET:-derm-dev-uploads}"

echo "Creating S3 bucket: ${BUCKET_NAME}"

# Create the bucket
awslocal s3 mb "s3://${BUCKET_NAME}" --region "${AWS_DEFAULT_REGION:-us-east-1}" || true

# Configure CORS for the bucket (needed for frontend uploads)
awslocal s3api put-bucket-cors --bucket "${BUCKET_NAME}" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

echo "S3 bucket ${BUCKET_NAME} created and configured successfully"

# List buckets to verify
echo "Available S3 buckets:"
awslocal s3 ls

echo "=== LocalStack Initialization Complete ==="
