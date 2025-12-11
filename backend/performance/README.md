# Performance Testing

This directory contains performance testing scripts for the backend API.

## Load Testing

We use [Autocannon](https://github.com/mcollina/autocannon) for HTTP load testing.

### Basic Usage

Test the health endpoint:
```bash
node performance/load-test.js /health
```

Test authenticated endpoints:
```bash
node performance/load-test.js /api/patients YOUR_JWT_TOKEN
```

### Custom Configuration

You can modify `load-test.js` to test different scenarios:
- Adjust `connections` for concurrent users
- Adjust `duration` for longer tests
- Modify headers for different scenarios

### Performance Benchmarks

Target performance metrics for production:

| Metric | Target | Warning |
|--------|--------|---------|
| P50 Latency | < 100ms | > 200ms |
| P95 Latency | < 500ms | > 1000ms |
| P99 Latency | < 1000ms | > 2000ms |
| Throughput | > 100 req/s | < 50 req/s |
| Error Rate | 0% | > 1% |

### Running Different Scenarios

**High Load Test:**
```bash
# Modify connections in load-test.js to 100
# Test sustained high load
```

**Spike Test:**
```bash
# Gradually increase connections
# Test handling of traffic spikes
```

**Endurance Test:**
```bash
# Modify duration to 300 (5 minutes)
# Test for memory leaks and degradation
```

## Monitoring

During load tests, monitor:
- CPU usage
- Memory usage
- Database connections
- Response times
- Error rates

Use the `/health/detailed` endpoint to check system health during tests.

## Best Practices

1. **Run tests in staging environment** - Never run load tests in production
2. **Warm up the system** - Run a brief test first to warm up caches
3. **Test realistic scenarios** - Use production-like data and queries
4. **Monitor database** - Watch for slow queries and connection pool exhaustion
5. **Test rate limits** - Verify rate limiting works under load
