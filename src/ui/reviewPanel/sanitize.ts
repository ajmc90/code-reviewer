import { PassConfig } from '../../types';

const PASS_KEYS = [
  'structural', 'explore', 'security', 'performance',
  'accessibility', 'tests', 'gaps', 'permute', 'critique',
] as const;

export function sanitizePasses(raw: any): Partial<PassConfig> {
  const out: Partial<PassConfig> = {};
  for (const k of PASS_KEYS) {
    if (typeof raw[k] === 'boolean') (out as any)[k] = raw[k];
  }
  return out;
}
