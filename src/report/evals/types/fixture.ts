/**
 * Fixture types — parsed expectations from expected-*.md files.
 */

/** A single expected item parsed from a fixture markdown heading. */
export interface ExpectationItem {
  /** Heading text, e.g. "Automation narrative stronger than delivery automation" */
  title: string;
  /** Full body text under the heading (bullets, metadata, prose) */
  body: string;
}

/** Expectations for a standard stage (signals, tensions, patterns, implications). */
export interface StageExpectations {
  must_detect: ExpectationItem[];
  nice_to_detect: ExpectationItem[];
  must_avoid: ExpectationItem[];
}

/** Expectations for the hypotheses stage (uses "acceptable alternatives" instead of "nice to detect"). */
export interface HypothesisExpectations {
  must_detect: ExpectationItem[];
  acceptable_alternatives: ExpectationItem[];
  must_avoid: ExpectationItem[];
}

/** All parsed expectations for a single fixture. */
export interface FixtureExpectations {
  signals: StageExpectations;
  tensions: StageExpectations;
  patterns: StageExpectations;
  hypotheses: HypothesisExpectations;
  implications: StageExpectations;
}
