import type { AnalysisResult } from './apiClient';

export type RightsState =
  | 'CLEAR'
  | 'PARTIALLY_CLEAR'
  | 'UNVERIFIED'
  | 'BLOCKED'
  | 'INGESTED';

export interface RightsDisplay {
  state: RightsState;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  tooltip: string;
  clickable: boolean;
}

const DISPLAY: Record<RightsState, Omit<RightsDisplay, 'state'>> = {
  CLEAR: {
    label: 'Rights clear',
    color: '#4abfa5',
    bgColor: 'rgba(72, 187, 165, 0.15)',
    borderColor: '#4abfa5',
    tooltip: 'Master ownership verified at 100%, one-stop confirmed, and PRO registration present. This track is cleared for sync placement.',
    clickable: false,
  },
  PARTIALLY_CLEAR: {
    label: 'Partially cleared',
    color: '#dcaa50',
    bgColor: 'rgba(220, 170, 80, 0.15)',
    borderColor: '#dcaa50',
    tooltip: 'Some clearance conditions are met, but the track has unresolved blockers. Review the blocker tags below and contact your rights administrator.',
    clickable: true,
  },
  BLOCKED: {
    label: 'Rights blocked',
    color: '#e05c5c',
    bgColor: 'rgba(224, 92, 92, 0.15)',
    borderColor: '#e05c5c',
    tooltip: 'A rights conflict or unknown rights owner was detected. Legal review is required before this track can be placed.',
    clickable: true,
  },
  UNVERIFIED: {
    label: 'Unverified',
    color: '#9b8fc0',
    bgColor: 'rgba(155, 143, 192, 0.15)',
    borderColor: '#9b8fc0',
    tooltip: 'A rights profile exists but all fields are empty. Submit master ownership, PRO registration, and one-stop status to enable clearance evaluation.',
    clickable: true,
  },
  INGESTED: {
    label: 'No rights data',
    color: '#7a7a8c',
    bgColor: 'rgba(122, 122, 140, 0.10)',
    borderColor: '#7a7a8c',
    tooltip: 'No rights profile has been attached to this track. Upload a rights profile to begin clearance evaluation.',
    clickable: true,
  },
};

export function rightsDisplayFor(
  rightsProfile: AnalysisResult['rightsProfile'],
): RightsDisplay {
  let state: RightsState = 'INGESTED';

  if (rightsProfile?.rightsState) {
    const s = rightsProfile.rightsState as RightsState;
    if (s in DISPLAY) state = s;
  } else if (rightsProfile) {
    // Fallback: derive from legacy fields when rightsState is absent (seed engine)
    if (rightsProfile.masterVerifiedAt && rightsProfile.proAffiliation) {
      state = 'CLEAR';
    } else if (rightsProfile.proAffiliation || rightsProfile.isOneStop != null) {
      state = 'PARTIALLY_CLEAR';
    } else {
      state = 'UNVERIFIED';
    }
  }

  return { state, ...DISPLAY[state] };
}
