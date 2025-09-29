import { R2Bucket } from '@cloudflare/workers-types';

// A simplified interface for the Puppeteer launch function
interface Puppeteer {
  launch: (options?: any) => Promise<Browser>;
}

interface Browser {
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
}

interface Page {
  setContent: (html: string) => Promise<void>;
  pdf: (options?: any) => Promise<Buffer>;
  close: () => Promise<void>;
}

// Interface for the signed URL generator mock
interface SignedUrlGenerator {
  getSignedUrl: (key: string) => Promise<string>;
}

import { TemplateManager } from './template-manager';

// Interface for the template loader mock
interface TemplateLoader {
  load: (templateName: string) => Promise<string>;
}

interface RenderReportParams {
  r2Bucket: R2Bucket;
  puppeteer: Puppeteer;
  signedUrlGenerator: SignedUrlGenerator;
  templateManager: TemplateManager;
  jobId: string;
  portfolioId: string;
  reportData: any; // In a real app, this would be a strongly-typed object
  format: 'pdf' | 'html';
}

interface RenderReportResult {
  downloadUrl: string;
  filePath: string;
}

/**
 * Renders a report, uploads it to R2, and returns a signed URL.
 */
export const renderReport = async ({
  r2Bucket,
  puppeteer,
  signedUrlGenerator,
  templateManager,
  jobId,
  portfolioId,
  reportData,
  format,
}: RenderReportParams): Promise<RenderReportResult> => {
  // 1. Render the HTML from a template
  const renderedHtml = await templateManager.render('report-template.html', { portfolioId, ...reportData });

  // 2. Generate PDF using Puppeteer
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(renderedHtml);
  const pdfBuffer = await page.pdf();
  await browser.close();

  // 3. Upload to R2
  const r2Key = `reports/${jobId}/report.${format}`;
  await r2Bucket.put(r2Key, pdfBuffer, {
    httpMetadata: { contentType: 'application/pdf' },
  });

  // 4. Generate signed URL
  const downloadUrl = await signedUrlGenerator.getSignedUrl(r2Key);

  // 5. Return the result
  return {
    downloadUrl,
    filePath: r2Key,
  };
};