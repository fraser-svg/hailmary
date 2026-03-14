/**
 * Intervention Map
 *
 * For each DiagnosisType, defines the ONE intervention that follows logically
 * from the diagnosis and is agency-deliverable.
 *
 * Design rules:
 *   - Exactly one intervention per diagnosis — no optionality here
 *   - Intervention type must match the SPEC 004 enum
 *   - Statement names what must change structurally, not what to do tactically
 *   - Rationale traces the logical chain: diagnosis → mechanism(s) → intervention
 *   - delivery_fit reflects whether an agency can actually execute this
 *   - expected_impact reflects the structural consequence if executed
 *
 * Agency-deliverable means: a GTM agency can scope, price, and deliver this
 * as a defined engagement. "Rebuild your product" is not agency-deliverable.
 * "Redesign your sales motion and build a playbook" is.
 */

import type { DiagnosisType, ImpactLevel, InterventionType } from './types.js'

export interface InterventionTemplate {
  type: InterventionType
  statement: string
  rationale: string
  expected_impact: ImpactLevel
  delivery_fit: ImpactLevel
}

const MAP: Record<DiagnosisType, InterventionTemplate> = {
  // -------------------------------------------------------------------------
  // founder_led_sales_ceiling
  //
  // The ceiling is structural: founder credibility cannot be delegated.
  // The intervention must build institutional substitutes for that credibility.
  // This is classic agency work: playbook, proof architecture, messaging system.
  // -------------------------------------------------------------------------
  founder_led_sales_ceiling: {
    type: 'founder_gtm_transition',
    statement:
      'Build a GTM motion that generates pipeline and closes deals without requiring the founder\'s direct involvement. ' +
      'This means a documented sales playbook, an institutional proof architecture the founder does not have to be present to activate, ' +
      'and a repeatable messaging framework a sales team can operate independently. ' +
      'The goal is not to remove the founder from the company — it is to make their involvement in any single deal optional.',
    rationale:
      'The diagnosis is a founder-led sales ceiling. The primary mechanism is founder lock-in: ' +
      'the founder is the trust asset and deals cannot close without them. ' +
      'The only structural intervention is to build institutional substitutes for that trust — ' +
      'proof, playbook, and messaging that work independently of the founder\'s presence.',
    expected_impact: 'high',
    delivery_fit: 'high',
  },

  // -------------------------------------------------------------------------
  // services_disguised_as_saas
  //
  // The narrative claims software scale; the delivery requires human effort.
  // The intervention forces a choice: productize or own the services model.
  // Both paths are legitimate — the problem is maintaining neither.
  // -------------------------------------------------------------------------
  services_disguised_as_saas: {
    type: 'positioning_reset',
    statement:
      'Choose a position and commit to it. ' +
      'Either explicitly own the managed service model — reframe delivery as a feature, price accordingly, ' +
      'and build case studies that make the service layer a proof of expertise rather than a gap in the product — ' +
      'or invest in productizing the service layer so that the software claim becomes true. ' +
      'Do not maintain both simultaneously. The positioning gap between claim and delivery creates a trust deficit ' +
      'that compounds at every stage of the funnel.',
    rationale:
      'The diagnosis is services disguised as SaaS. The primary mechanism is a delivery constraint: ' +
      'the product cannot deliver its promise without significant human involvement. ' +
      'The intervention is a positioning reset that resolves the contradiction — ' +
      'either by aligning the narrative with the actual model or by investing to make the model match the narrative.',
    expected_impact: 'high',
    delivery_fit: 'high',
  },

  // -------------------------------------------------------------------------
  // developer_adoption_without_buyer_motion
  //
  // The wrong person is in the funnel. Developers adopt; buyers purchase.
  // The intervention bridges that gap with a commercial motion and proof.
  // -------------------------------------------------------------------------
  developer_adoption_without_buyer_motion: {
    type: 'sales_motion_redesign',
    statement:
      'Design a commercial motion that reaches economic buyers directly — not through developer adoption alone. ' +
      'This requires three components: buyer-facing proof in business-outcome language (not capability language), ' +
      'a top-of-funnel motion that targets budget owners alongside technical users, ' +
      'and a structured conversion path that turns individual technical usage into an organisational purchasing decision. ' +
      'Developer adoption is a lead, not a sale. Build the bridge.',
    rationale:
      'The diagnosis is developer adoption without buyer motion. The primary mechanism is buyer psychology: ' +
      'technical users and economic buyers operate with entirely different decision criteria, ' +
      'and the current motion only reaches one of them. ' +
      'Redesigning the sales motion to explicitly target and convert economic buyers is the structural change required.',
    expected_impact: 'high',
    delivery_fit: 'high',
  },

  // -------------------------------------------------------------------------
  // enterprise_theatre
  //
  // Positioning claims enterprise capability that delivery cannot support.
  // The intervention redefines the ICP to match where real success exists.
  // -------------------------------------------------------------------------
  enterprise_theatre: {
    type: 'icp_redefinition',
    statement:
      'Redefine the ICP to match the observable customer evidence and current delivery capability. ' +
      'Identify the segment where the product genuinely succeeds — based on case study patterns, ' +
      'customer retention signals, and sales cycle evidence — and commit to that segment explicitly. ' +
      'Stop targeting enterprise buyers the current sales infrastructure, proof architecture, ' +
      'and delivery capacity cannot reliably serve. ' +
      'Build depth in the segment where evidence already exists rather than width in a segment that requires infrastructure you do not have.',
    rationale:
      'The diagnosis is enterprise theatre. The primary mechanism is investor signalling: ' +
      'enterprise positioning serves external audiences rather than reflecting operational reality. ' +
      'ICP redefinition is the prerequisite for all other GTM work — ' +
      'without a realistic ICP, messaging, proof, and sales motion cannot be built on solid ground.',
    expected_impact: 'medium',
    delivery_fit: 'high',
  },

  // -------------------------------------------------------------------------
  // distribution_fragility
  //
  // One channel, one point of failure. The intervention builds the second channel.
  // This is a structural commitment, not a tactical add-on.
  // -------------------------------------------------------------------------
  distribution_fragility: {
    type: 'distribution_strategy_reset',
    statement:
      'Build a second distribution channel that does not share a single point of failure with the first. ' +
      'This is a structural commitment: it requires identifying which new acquisition mechanism is most consistent ' +
      'with the ICP and delivery model, investing in it until it produces repeatable demand, ' +
      'and accepting that the second channel will underperform the first channel for a period. ' +
      'The goal is not to replace the existing channel — it is to ensure that the business does not stop ' +
      'when that channel is disrupted.',
    rationale:
      'The diagnosis is distribution fragility driven by channel concentration. ' +
      'The primary mechanism is founder lock-in or single-channel dependency: ' +
      'the company optimised one channel until it became structurally load-bearing. ' +
      'A distribution strategy reset adds resilience by building a second independent demand mechanism.',
    expected_impact: 'high',
    delivery_fit: 'medium',
  },

  // -------------------------------------------------------------------------
  // narrative_distribution_mismatch
  //
  // The story and the motion diverge. The intervention aligns them.
  // Easiest path: fix the story to match the motion (not rebuild the motion).
  // -------------------------------------------------------------------------
  narrative_distribution_mismatch: {
    type: 'positioning_reset',
    statement:
      'Align the stated go-to-market narrative with the actual distribution architecture. ' +
      'Audit every claim made about how the company reaches and converts customers — ' +
      'in pitch decks, on the website, in sales conversations — and compare it to how deals actually originate. ' +
      'Where the claim diverges from the reality, choose one: ' +
      'build the distribution that the narrative implies, or change the narrative to describe how you actually sell. ' +
      'Maintaining a story that does not match the motion creates internal misalignment, ' +
      'inconsistent sales execution, and buyer confusion at the point of close.',
    rationale:
      'The diagnosis is a narrative-distribution mismatch. The primary mechanism is investor signalling: ' +
      'the stated narrative serves external stakeholders rather than reflecting operational reality. ' +
      'A positioning reset that aligns story and motion eliminates the internal contradiction ' +
      'and gives the sales team a single coherent frame to operate from.',
    expected_impact: 'medium',
    delivery_fit: 'high',
  },
}

export function getInterventionTemplate(diagnosisType: DiagnosisType): InterventionTemplate {
  return MAP[diagnosisType]
}
