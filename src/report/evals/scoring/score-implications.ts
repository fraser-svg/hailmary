import type { StageExpectations } from '../types/fixture.js';
import type { StageScore } from '../types/eval-result.js';
import { type StageOutputItem, scoreStage } from './common.js';

export function scoreImplications(
  expectations: StageExpectations,
  actual: StageOutputItem[],
): StageScore {
  return scoreStage('implications', expectations, actual);
}
