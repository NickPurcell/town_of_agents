import { app } from 'electron';
import { join } from 'path';
import { readFileSync } from 'fs';
import { is } from '@electron-toolkit/utils';

// Cache for loaded prompts
const promptCache: Map<string, string> = new Map();

/**
 * Get the path to the prompts directory
 * In development: project root/prompts
 * In production: app resources/prompts
 */
function getPromptsPath(): string {
  if (is.dev) {
    // In development, prompts are in project root
    return join(process.cwd(), 'prompts');
  } else {
    // In production, prompts are bundled with the app
    return join(app.getAppPath(), 'prompts');
  }
}

/**
 * Load a prompt file from the prompts directory
 * Results are cached for performance
 */
export function loadPrompt(filename: string): string {
  // Check cache first
  if (promptCache.has(filename)) {
    return promptCache.get(filename)!;
  }

  const promptPath = join(getPromptsPath(), filename);
  const content = readFileSync(promptPath, 'utf-8');

  // Cache the loaded prompt
  promptCache.set(filename, content);

  return content;
}

/**
 * Inject template variables into a prompt string
 * Variables are in the format {{variableName}}
 */
export function injectVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}

/**
 * Clear the prompt cache (useful for development/testing)
 */
export function clearPromptCache(): void {
  promptCache.clear();
}
