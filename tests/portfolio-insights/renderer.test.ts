import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { R2Bucket } from '@cloudflare/workers-types';

// 1. Import project modules to be mocked.
import { R2SignedUrlGenerator } from 'src/portfolio-insights/r2-signed-url-generator';
import { TemplateManager } from 'src/portfolio-insights/template-manager';

// 2. Import the function to be tested.
import { renderReport } from 'src/portfolio-insights/renderer';

// 3. Tell Vitest to mock the project's internal modules.
vi.mock('src/portfolio-insights/r2-signed-url-generator');
vi.mock('src/portfolio-insights/template-manager');

describe('Report Renderer', () => {

  beforeEach(() => {
    // Reset all mocks before each test.
    vi.resetAllMocks();
  });

  it('should render a report, upload it to R2, and return a signed URL', async () => {
    // 4. Arrange: Manually create mock objects and functions for all dependencies.

    // Manual mock for puppeteer
    const mockPdf = vi.fn().mockResolvedValue(Buffer.from('dummy-pdf-content'));
    const mockSetContent = vi.fn().mockResolvedValue(undefined);
    const mockPage = {
      setContent: mockSetContent,
      pdf: mockPdf,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);
    const mockPuppeteer = {
        launch: mockLaunch,
    };

    // Manual mock for R2
    const mockR2Put = vi.fn().mockResolvedValue({});
    const mockR2Bucket = {
      put: mockR2Put,
    } as unknown as R2Bucket;

    // Configure mocks for our own modules
    const mockGetSignedUrl = vi.fn().mockResolvedValue('https://signed-url.com/report.pdf');
    vi.mocked(R2SignedUrlGenerator).mockReturnValue({
      getSignedUrl: mockGetSignedUrl,
    } as unknown as R2SignedUrlGenerator);

    // Mock for the new TemplateManager
    const mockRender = vi.fn().mockResolvedValue('<h1>Rendered HTML</h1>');
    vi.mocked(TemplateManager).mockReturnValue({
      render: mockRender,
    } as unknown as TemplateManager);

    // Arrange inputs for the function call
    const signedUrlGenerator = new R2SignedUrlGenerator();
    const templateManager = new TemplateManager();

    const jobId = 'test-job-id';
    const portfolioId = 'test-portfolio-id';
    const reportData = { portfolioName: 'My Test Portfolio' };

    // 5. Act: Call the function with the refactored dependencies.
    const result = await renderReport({
      r2Bucket: mockR2Bucket,
      puppeteer: mockPuppeteer,
      signedUrlGenerator,
      templateManager, // Use the new templateManager
      jobId,
      portfolioId,
      reportData,
      format: 'pdf',
    });

    // 6. Assert: Verify the new interactions.
    expect(mockRender).toHaveBeenCalledWith('report-template.html', { portfolioId, ...reportData });
    expect(mockLaunch).toHaveBeenCalled();
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockSetContent).toHaveBeenCalledWith('<h1>Rendered HTML</h1>'); // Check with rendered content
    expect(mockPdf).toHaveBeenCalled();

    const expectedR2Key = `reports/${jobId}/report.pdf`;
    expect(mockR2Put).toHaveBeenCalledWith(
      expectedR2Key,
      expect.any(Buffer),
      { httpMetadata: { contentType: 'application/pdf' } }
    );

    expect(mockGetSignedUrl).toHaveBeenCalledWith(expectedR2Key);

    expect(result).toEqual({
      downloadUrl: 'https://signed-url.com/report.pdf',
      filePath: expectedR2Key,
    });
  });
});