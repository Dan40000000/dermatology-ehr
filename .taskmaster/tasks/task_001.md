# Task ID: 1

**Title:** Database Schema for Time Blocks

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Create database tables and indexes for provider/location time blocks with conflict detection support.

**Details:**

Add `time_blocks` table with fields: id, provider_id, location_id, start_time, end_time, recurrence_pattern (JSON for weekly/daily), color_code, description, is_active. Add indexes on provider_id+start_time+end_time composite and location_id. Implement check constraints to prevent invalid overlaps at DB level. Use Rails migration or equivalent SQL: `CREATE TABLE time_blocks (...); CREATE INDEX idx_time_blocks_provider_time ON time_blocks(provider_id, start_time, end_time);`. Ensure no PHI storage.

**Test Strategy:**

Unit tests: validate migration creates tables/indexes correctly; test overlap detection query returns expected conflicts; integration test: insert block and verify index usage with EXPLAIN.

## Subtasks

### 1.1. Create time_blocks table migration

**Status:** pending  
**Dependencies:** None  

Generate Rails migration to create time_blocks table with all specified fields including id, provider_id, location_id, start_time, end_time, recurrence_pattern as JSON, color_code, description, is_active, plus timestamps and ensure no PHI fields.

**Details:**

Use create_table with t.bigint :provider_id, t.bigint :location_id, t.datetime :start_time, t.datetime :end_time, t.json :recurrence_pattern, t.string :color_code, t.text :description, t.boolean :is_active, default: true. Add foreign key constraints if applicable. Verify schema follows best practices.

### 1.2. Add indexes and overlap check constraints

**Status:** pending  
**Dependencies:** 1.1  

Implement composite indexes on provider_id+start_time+end_time and location_id; add database-level check constraints or partial unique indexes to prevent time overlaps per provider/location.

**Details:**

Use add_index :time_blocks, [:provider_id, :start_time, :end_time], name: 'idx_time_blocks_provider_time', using: :btree. Add location_id index. Implement overlap prevention via exclusion constraint (PostgreSQL) or unique index with range types. Include test insert queries to validate.
