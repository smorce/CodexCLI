/**
 * Generates a signed URL for an R2 object.
 * In a real implementation, this would interact with the R2 API.
 * For now, it returns a hardcoded string to satisfy the test.
 */
export class R2SignedUrlGenerator {
  async getSignedUrl(key: string): Promise<string> {
    console.log(`Generating signed URL for key: ${key}`);
    return 'https://signed-url.com/report.pdf';
  }
}