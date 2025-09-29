import { describe, it, expect } from 'vitest';
import { JobStatus, JobType } from '../../src/core/job';

describe('Job Core Module', () => {
  it('should correctly export the JobStatus enum', () => {
    // This test simply verifies that the enum can be imported and its values are accessible.
    expect(JobStatus).toBeDefined();
    expect(JobStatus.PENDING).toBe('PENDING');
    expect(JobStatus.COMPLETED).toBe('COMPLETED');
  });

  it('should correctly export the JobType enum', () => {
    expect(JobType).toBeDefined();
    expect(JobType.FRONTIER).toBe('FRONTIER');
    expect(JobType.OPTIMAL).toBe('OPTIMAL');
  });
});