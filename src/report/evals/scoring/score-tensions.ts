import type { StageExpectations } from '../types/fixture.js';
import type { StageScore } from '../types/eval-result.js';
import { type StageOutputItem, scoreStage } from './common.js';

export function scoreTensions(
  expectations: StageExpectations,
  actual: StageOutputItem[],
): StageScore {
  return scoreStage('tensions', expectations, actual);
}
