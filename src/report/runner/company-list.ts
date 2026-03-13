/**
 * ICP company list for batch analysis.
 *
 * Target profile:
 *   - UK / UK-adjacent companies
 *   - £500k – £10M ARR
 *   - Seed / Series A / early Series B
 *   - B2B SaaS / devtools / software
 *   - "Messy growth stage": narrative evolving, founder-led sales,
 *     hiring signals, enterprise vs SMB tension, product vs services
 */

export interface CompanyEntry {
  name: string;
  domain: string;
}

export const companies: CompanyEntry[] = [
  { name: 'Attio', domain: 'attio.com' },
  { name: 'PostHog', domain: 'posthog.com' },
  { name: 'Incident.io', domain: 'incident.io' },
  { name: 'Metaview', domain: 'metaview.ai' },
  { name: 'Screenloop', domain: 'screenloop.com' },
  { name: 'Sona', domain: 'sona.so' },
  { name: 'Raycast', domain: 'raycast.com' },
  { name: 'Builder.io', domain: 'builder.io' },
];
