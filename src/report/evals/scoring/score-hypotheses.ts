import type { HypothesisExpectations } from '../types/fixture.js';
import type { StageScore } from '../types/eval-result.js';
import { type StageOutputItem, scoreStage } from './common.js';

export function scoreHypotheses(
  expectations: HypothesisExpectations,
  actual: StageOutputItem[],
): StageScore {
  return scoreStage('hypotheses', expectations, actual);
}
