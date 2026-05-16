/**
 * Compatibility shim: the webview client used to live in this single ~1700
 * line file. It now lives under ./client/, split into fragments concatenated
 * by ./client/bundle.ts. This re-export keeps existing import paths working
 * (`import { buildClientScript } from './client'`).
 *
 * Safe to delete once every importer points at ./client/bundle directly.
 */
export { buildClientScript } from './client/bundle';
