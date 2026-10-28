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

export function loadBasketballRules(): BasketballRules {
  return { ...DEFAULT_BASKETBALL_RULES };
}
