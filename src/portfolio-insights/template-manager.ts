import fs from 'fs/promises';
import path from 'path';

/**
 * A simple template renderer that replaces placeholders like {{key}}.
 * @param template The template string.
 * @param data The data to inject into the template.
 * @returns The rendered string.
 */
const render = (template: string, data: Record<string, any>): string => {
  let rendered = template;
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, data[key]);
  }
  return rendered;
};


export class TemplateManager {
  private templateCache: Map<string, string> = new Map();

  /**
   * Loads a template from the filesystem and renders it with the given data.
   * In a real Cloudflare Worker, this would use `import` for static assets
   * or another mechanism, not the 'fs' module. This is a placeholder.
   * @param templateName The name of the template file (e.g., 'report-template.html').
   * @param data The data to inject into the template.
   * @returns The rendered HTML string.
   */
  public async render(templateName: string, data: Record<string, any>): Promise<string> {
    let template = this.templateCache.get(templateName);

    if (!template) {
      // This is a placeholder for loading templates in a worker environment.
      // In a real scenario, you might use text imports or fetch from R2.
      // For now, we'll return a simple hardcoded template for testability.
      template = '<h1>Report for {{portfolioId}}</h1>';
      this.templateCache.set(templateName, template);
    }

    return render(template, data);
  }
}