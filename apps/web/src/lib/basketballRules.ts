export type BasketballRules = {
  periodLengthMinutes: number;
  firstHalfTimeouts: number;
  secondHalfTimeouts: number;
  fourthQuarterTimeoutRestrictionMinutes: number;
  finalTwoMinuteTimeoutMax: number;
  timeoutDurationSeconds: number;
  headCoachRequestRequired: boolean;
  playerFoulLimit: number;
  teamFoulPenaltyAt: number;
  teamFoulFreeThrows: number;
  technicalFreeThrows: number;
  ejectionTechnicalLimit: number;
  ejectionUnsportsmanlikeLimit: number;
  ejectionMixedTechnicalLimit: number;
  ejectionMixedUnsportsmanlikeLimit: number;
  overtimeMinutes: number;
  overtimeTimeouts: number;
  carryFourthQuarterFoulsToOvertime: boolean;
  runningClockEnabled: boolean;
  clockStopLastMinutes: number;
  clockStopInSecondQuarter: boolean;
  clockStopInFourthQuarter: boolean;
};

export const DEFAULT_BASKETBALL_RULES: BasketballRules = {
  periodLengthMinutes: 10,
  firstHalfTimeouts: 2,
  secondHalfTimeouts: 3,
  fourthQuarterTimeoutRestrictionMinutes: 2,
  finalTwoMinuteTimeoutMax: 2,
  timeoutDurationSeconds: 60,
  headCoachRequestRequired: true,
  playerFoulLimit: 5,
  teamFoulPenaltyAt: 5,
  teamFoulFreeThrows: 2,
  technicalFreeThrows: 1,
  ejectionTechnicalLimit: 2,
  ejectionUnsportsmanlikeLimit: 2,
  ejectionMixedTechnicalLimit: 1,
  ejectionMixedUnsportsmanlikeLimit: 1,
  overtimeMinutes: 5,
  overtimeTimeouts: 1,
  carryFourthQuarterFoulsToOvertime: true,
  runningClockEnabled: true,
  clockStopLastMinutes: 2,
  clockStopInSecondQuarter: true,
  clockStopInFourthQuarter: true,
};

const STORAGE_KEY = 'eo2mate-sports-basketball-rules-v1';

export function loadBasketballRules(): BasketballRules {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_BASKETBALL_RULES, ...JSON.parse(stored) } : DEFAULT_BASKETBALL_RULES;
  } catch {
    return DEFAULT_BASKETBALL_RULES;
  }
}

export function saveBasketballRules(rules: BasketballRules): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Keep the rules usable in the current screen if browser storage is unavailable.
  }
}
