/**
 * ES Module wrapper for Google Generative AI
 * This file must be processed as an ES module (hence the .mjs extension)
 */
import { GoogleGenAI } from '@google/genai';

/**
 * Creates a new GoogleGenAI instance
 * @param {string} apiKey - The API key for Google Generative AI
 * @returns {Object} The initialized GoogleGenAI instance
 */
export function createGeminiClient(apiKey) {
  if (!apiKey) {
    throw new Error('No API key provided for Google Generative AI');
  }
  
  return new GoogleGenAI({ apiKey });
}

/**
 * Exports the Type enum from @google/genai
 */
export { Type } from '@google/genai';

/**
 * Simple health check function to verify the module loaded correctly
 */
export function checkHealth() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}
