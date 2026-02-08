# Task ID: 16

**Title:** Repository Adoption + Migration Consolidation (UNIVERSAL-004)

**Status:** pending

**Dependencies:** 15

**Priority:** high

**Description:** Adopt BaseRepository for data access and consolidate migrations and seeds into a single runner.

**Details:**

Create migrator and seeder to run all SQL migrations, add repositories for core entities, replace inline SQL with repository calls, and add missing indexes or soft delete support.

**Test Strategy:**

Migration integration tests cover full migration set; repository tests cover CRUD and pagination; performance checks for key queries.

## Subtasks

### 16.1. Build migrator and seeder to run all migrations

**Status:** pending  
**Dependencies:** None  

Create a single migrator and seeder to execute all SQL files reliably.

**Details:**

Implement backend/src/db/migrator.ts and backend/src/db/seeder.ts to load all migration and seed files in order with consistent logging.

### 16.2. Implement repositories for core entities

**Status:** pending  
**Dependencies:** 16.1  

Add repositories for key domains using BaseRepository.

**Details:**

Create PatientRepository, AppointmentRepository, EncounterRepository, and BillingRepository with tenant scoping and soft delete support.

### 16.3. Replace inline SQL in core routes

**Status:** pending  
**Dependencies:** 16.2  

Refactor data access to repositories and remove SELECT * usage.

**Details:**

Update top routes and services to use repositories, remove inline SQL, and add missing indexes for critical queries.
