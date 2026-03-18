/**
 * Rory Review Types — V3 Memo Layer (V3-M5b)
 *
 * RoryReviewResult is the output of roryReview() — an LLM evaluation
 * of the memo through the lens of Rory Sutherland's intellectual framework:
 * behavioural economics, reframing, psychological insight, asymmetric value.
 *
 * The review evaluates 4 scoring dimensions (0–5 each, pass >= 3) plus
 * 1 named test: the Pub Test.
 *
 * Dimensions:
 *   reframe_quality        — does it show the founder something new?
 *   behavioural_insight    — does it name a psychological mechanism?
 *   asymmetric_opportunity — does it point to a disproportionate lever?
 *   memorability           — would someone retell this observation?
 *
 * verdict = "approve" only if all 4 dims >= 3 AND pub_test = "pass"
 */

/** Score for a single Rory evaluation dimension */
export interface RoryDimensionScore {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  pass: boolean;           // true if score >= 3
  notes: string;           // Rory's explanation
}

/**
 * Pub Test — "Would Rory bring this up at the pub?"
 * Binary pass/fail. Evaluates whether the memo's central observation
 * is genuinely interesting as a story, not just as analysis.
 */
export interface PubTest {
  result: "pass" | "fail";
  reasoning: string;
}

/**
 * Structured revision guidance from Rory when verdict = "revise".
 * Consumed by buildUserPrompt() in write-memo.ts on the Rory revision attempt.
 */
export interface RoryRevisionNotes {
  what_is_boring: string;              // What makes the current memo uninteresting
  what_would_be_interesting: string;   // What angle/reframe would make it compelling
  missing_behavioural_layer: string;   // What psychological insight is absent
  specific_suggestions: string[];      // 2-3 concrete rewrite suggestions (clamped to max 3)
}

/**
 * RoryReviewResult — output of roryReview().
 * verdict = "approve" only if all 4 dimensions >= 3 AND pub_test = "pass".
 */
export interface RoryReviewResult {
  review_id: string;               // "rory_<company_id>_<timestamp>"
  company_id: string;
  memo_id: string;
  reviewed_at: string;
  attempt_number: 1 | 2;          // Rory's attempt (1 = first review, 2 = post-revision)

  dimensions: {
    reframe_quality: RoryDimensionScore;
    behavioural_insight: RoryDimensionScore;
    asymmetric_opportunity: RoryDimensionScore;
    memorability: RoryDimensionScore;
  };

  pub_test: PubTest;
  verdict: "approve" | "revise";
  revision_notes?: RoryRevisionNotes;  // Populated when verdict = "revise"
}
