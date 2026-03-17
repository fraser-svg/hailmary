/**
 * Legacy ICP company list. Use /discover-icp-companies skill for
 * structured discovery with fit scoring.
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
