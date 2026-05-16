/**
 * Compatibility shim: the panel's CSS used to live in this single ~1600 line
 * file. It now lives under ./styles/, split into fragments concatenated by
 * ./styles/bundle.ts. This re-export keeps existing import paths working
 * (`import { STYLES } from './styles'`).
 *
 * Safe to delete once every importer points at ./styles/bundle directly.
 */
export { STYLES } from './styles/bundle';
