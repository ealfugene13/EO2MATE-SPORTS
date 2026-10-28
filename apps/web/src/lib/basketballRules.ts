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

