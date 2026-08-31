/**
 * A session-stable rendering budget.  Keep this decision in one place so the
 * independent WebGL scenes do not make conflicting guesses about the device.
 * It is resolved lazily because this module is also safe to import during SSR.
 */
export type QualityTier = 'high' | 'balanced' | 'low';

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
  readonly mobileInput: boolean;
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: number;
  readonly trailSimulationDownscale: number;
}

let cachedProfile: QualityProfile | undefined;

/** Resolve once per page load; media and hardware changes apply on the next visit. */
export function getQualityProfile(): QualityProfile {
  if (cachedProfile) return cachedProfile;

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return (cachedProfile = Object.freeze({
      tier: 'low',
      reducedMotion: true,
      coarsePointer: true,
      mobileInput: true,
      maxPixelRatio: 1,
      antialias: false,
      shadowsEnabled: false,
      shadowMapSize: 512,
      trailSimulationDownscale: 6,
    }));
  }

  const reducedMotion = matches('(prefers-reduced-motion: reduce)');
  const coarsePointer = matches('(pointer: coarse)');
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hardwareConcurrency = navigator.hardwareConcurrency;
  const mobileInput = coarsePointer || navigator.maxTouchPoints > 0;
  const constrainedHardware =
    (typeof deviceMemory === 'number' && deviceMemory <= 4) ||
    (typeof hardwareConcurrency === 'number' && hardwareConcurrency <= 4);
  const tier: QualityTier =
    reducedMotion || coarsePointer || constrainedHardware
      ? 'low'
      : window.devicePixelRatio > 1.5
        ? 'high'
        : 'balanced';

  cachedProfile = Object.freeze({
    tier,
    reducedMotion,
    coarsePointer,
    mobileInput,
    // Touch/coarse devices are often high-DPR but GPU constrained.  1.5 keeps
    // the scenes crisp while avoiding a fourfold drawing-buffer cost.
    maxPixelRatio: mobileInput ? 1.5 : tier === 'low' ? 1.5 : 2,
    antialias: tier !== 'low',
    shadowsEnabled: !reducedMotion,
    shadowMapSize: tier === 'high' ? 2048 : tier === 'balanced' ? 1024 : 512,
    trailSimulationDownscale: tier === 'high' ? 4 : 6,
  });
  return cachedProfile;
}

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}
