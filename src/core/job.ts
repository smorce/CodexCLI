/**
 * This module provides a central point of access for job-related domain types.
 * By re-exporting types from the auto-generated Prisma client, we can decouple
 * the rest of our application from a direct dependency on Prisma, making the
 * codebase more modular and easier to refactor in the future.
 */

import { JobStatus, JobType } from '@prisma/client';

// Re-exporting the enums allows other parts of the application to import them
// from a consistent, domain-oriented location (`src/core/job`) rather than
// directly from the Prisma client.
export { JobStatus, JobType };