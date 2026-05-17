import type { AnalysisResult } from './apiClient';

export type RightsStatus = 'complete' | 'unclear';

export function rightsStatusFor(
  rightsProfile: AnalysisResult['rightsProfile'],
): RightsStatus {
  if (!rightsProfile) return 'unclear';
  if (rightsProfile.masterVerifiedAt && rightsProfile.proAffiliation) {
    return 'complete';
  }
  return 'unclear';
}

export function rightsBadgeLabel(status: RightsStatus): string {
  return status === 'complete' ? 'Metadata complete' : 'Rights unclear';
}
