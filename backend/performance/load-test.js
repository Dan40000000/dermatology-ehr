/**
 * Load Testing with Autocannon
 *
 * Usage:
 *   node performance/load-test.js [endpoint] [token]
 *
 * Example:
 *   node performance/load-test.js /api/patients eyJhbGc...
 */

const autocannon = require('autocannon');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:4000';
const ENDPOINT = process.argv[2] || '/health';
const AUTH_TOKEN = process.argv[3] || '';
const TENANT_ID = process.env.TENANT_ID || 'tenant-demo';

const options = {
  url: `${BASE_URL}${ENDPOINT}`,
  connections: 10, // Concurrent connections
  duration: 10, // Duration in seconds
  pipelining: 1, // Number of pipelined requests
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-Id': TENANT_ID,
  },
};

// Add auth header if token provided
if (AUTH_TOKEN) {
  options.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
}

console.log('Starting load test...');
console.log(`URL: ${options.url}`);
console.log(`Connections: ${options.connections}`);
console.log(`Duration: ${options.duration}s`);
console.log('---');

const instance = autocannon(options, (err, result) => {
  if (err) {
    console.error('Load test failed:', err);
    process.exit(1);
  }

  console.log('\n=== Load Test Results ===');
  console.log(`Requests: ${result.requests.total}`);
  console.log(`Throughput: ${result.throughput.mean} bytes/sec`);
  console.log(`Duration: ${result.duration}s`);
  console.log('\nLatency:');
  console.log(`  Mean: ${result.latency.mean}ms`);
  console.log(`  P50: ${result.latency.p50}ms`);
  console.log(`  P95: ${result.latency.p95}ms`);
  console.log(`  P99: ${result.latency.p99}ms`);
  console.log(`  Max: ${result.latency.max}ms`);
  console.log('\nRequests per second:');
  console.log(`  Mean: ${result.requests.mean}`);
  console.log(`  Total: ${result.requests.total}`);
  console.log('\nStatus Codes:');
  Object.keys(result.statusCodeStats || {}).forEach(code => {
    console.log(`  ${code}: ${result.statusCodeStats[code]}`);
  });

  // Check for performance issues
  const warnings = [];
  if (result.latency.p95 > 1000) {
    warnings.push('⚠️  P95 latency exceeds 1 second');
  }
  if (result.latency.p99 > 2000) {
    warnings.push('⚠️  P99 latency exceeds 2 seconds');
  }
  if (result.errors > 0) {
    warnings.push(`⚠️  ${result.errors} errors occurred`);
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  Performance Warnings:');
    warnings.forEach(w => console.log(w));
  } else {
    console.log('\n✓ Performance looks good!');
  }
});

// Track progress
autocannon.track(instance, {
  renderProgressBar: true,
  renderLatencyTable: true,
  renderResultsTable: true,
});
