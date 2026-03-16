/**
 * Acquisition Layer Audit Script
 * Runs V3-U1 through V3-U4 for a given company and prints corpus stats.
 * Usage: npx tsx src/scripts/run-acquisition-audit.ts <company> <domain>
 *
 * Uses:
 *   - Site corpus: fetch-based provider (strips HTML, marks as 'webfetch')
 *   - External research: Perplexity (auto from PERPLEXITY_API_KEY)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Load .env manually
// ---------------------------------------------------------------------------
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../../.env");
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {
  // .env not found — rely on actual env
}

// ---------------------------------------------------------------------------
// Imports (after env is loaded so providers can read process.env)
// ---------------------------------------------------------------------------
import type { SiteCorpusProvider, SiteCorpusAcquisitionInput } from "../intelligence-v3/acquisition/site-corpus.js";
import { siteCorpusAcquisition } from "../intelligence-v3/acquisition/site-corpus.js";
import { externalResearchAcquisition } from "../intelligence-v3/acquisition/external-research.js";
import { mergeResearchCorpus } from "../intelligence-v3/acquisition/merge-corpus.js";
import type { CorpusPage } from "../intelligence-v3/types/research-corpus.js";

// ---------------------------------------------------------------------------
// Simple HTML-stripping fetch provider
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

const FETCH_TIMEOUT_MS = 12_000;

const fetchProvider: SiteCorpusProvider = {
  acquisition_method: "webfetch",
  async fetchPage(url: string) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HailMaryBot/1.0)" },
      });
      clearTimeout(timer);
      if (!res.ok) return { text: "", success: false };
      const html = await res.text();
      const text = stripHtml(html);
      return { text, success: text.length > 100 };
    } catch {
      return { text: "", success: false };
    }
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [, , company = "Trigger.dev", domain = "trigger.dev"] = process.argv;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`ACQUISITION LAYER AUDIT — ${company} (${domain})`);
  console.log(`${"=".repeat(70)}\n`);

  const t0 = Date.now();

  // V3-U1: Site corpus
  console.log("▶ V3-U1: Site corpus acquisition...");
  const t1 = Date.now();
  let siteCorpus;
  try {
    const input: SiteCorpusAcquisitionInput = { domain, provider: fetchProvider };
    siteCorpus = await siteCorpusAcquisition(input);
  } catch (err) {
    console.error("ERR_SITE_CORPUS:", String(err));
    process.exit(1);
  }
  const t1e = Date.now();
  console.log(`   Done in ${t1e - t1}ms — ${siteCorpus.pages.length} pages\n`);

  // V3-U2: External research (Perplexity auto)
  console.log("▶ V3-U2: External research acquisition (Perplexity)...");
  const t2 = Date.now();
  const externalCorpus = await externalResearchAcquisition({ company, domain });
  const t2e = Date.now();
  console.log(
    `   Done in ${t2e - t2}ms — ${externalCorpus.sources.length} sources\n`
  );

  // V3-U3: Merge
  const corpus = mergeResearchCorpus(siteCorpus, externalCorpus);

  const totalDuration = Date.now() - t0;

  // ---------------------------------------------------------------------------
  // Print report
  // ---------------------------------------------------------------------------

  const sep = "-".repeat(70);
  console.log(`\n${sep}`);
  console.log("ACQUISITION REPORT");
  console.log(sep);

  // 1. Total site pages
  console.log(`\n1. SITE PAGES FETCHED: ${siteCorpus.pages.length}`);
  console.log(`   Attempted: ${siteCorpus.fetch_metadata.attempted_pages.length}`);
  console.log(`   Failed: ${siteCorpus.fetch_metadata.failed_pages.length}`);
  if (siteCorpus.fetch_metadata.failed_pages.length > 0) {
    console.log(`   Failed URLs: ${siteCorpus.fetch_metadata.failed_pages.join(", ")}`);
  }

  // 2. Total external sources
  console.log(`\n2. EXTERNAL SOURCES FETCHED: ${externalCorpus.sources.length}`);
  console.log(
    `   Source types successful: ${externalCorpus.source_metadata.source_types_successful.join(", ") || "none"}`
  );
  console.log(
    `   Source types attempted: ${externalCorpus.source_metadata.source_types_attempted.join(", ")}`
  );

  // 3. Tier distribution
  const tierCounts: Record<number, number> = {};
  for (const p of siteCorpus.pages) tierCounts[p.source_tier] = (tierCounts[p.source_tier] ?? 0) + 1;
  for (const s of externalCorpus.sources) tierCounts[s.source_tier] = (tierCounts[s.source_tier] ?? 0) + 1;
  console.log(`\n3. TIER DISTRIBUTION:`);
  for (const tier of [1, 2, 3, 4, 5]) {
    if (tierCounts[tier]) console.log(`   Tier ${tier}: ${tierCounts[tier]}`);
  }

  // 4. External source domains
  console.log(`\n4. EXTERNAL SOURCE DOMAINS:`);
  for (const src of externalCorpus.sources) {
    let urlDomain: string;
    try { urlDomain = new URL(src.url).hostname; } catch { urlDomain = src.url; }
    console.log(`   [${src.source_type}] ${urlDomain}`);
  }

  // 5 & 6. Source category counts
  const reviewTypes = ["review_trustpilot", "review_g2_snippet", "review_capterra_snippet"];
  const pressTypes = ["press_mention"];
  const reviewCount = externalCorpus.sources.filter(s => reviewTypes.includes(s.source_type)).length;
  const pressCount = externalCorpus.sources.filter(s => pressTypes.includes(s.source_type)).length;
  console.log(`\n5. REVIEW / COMMUNITY SOURCES: ${reviewCount}`);
  console.log(`6. PRESS SOURCES: ${pressCount}`);

  // 7. Site page token counts
  console.log(`\n7. SITE PAGE TOKEN COUNTS:`);
  let siteTotalTokens = 0;
  for (const p of siteCorpus.pages) {
    console.log(`   [${p.page_type}] ${p.token_count} tokens — ${p.url}`);
    siteTotalTokens += p.token_count;
  }
  console.log(`   TOTAL SITE TOKENS: ${siteTotalTokens}`);

  // 8. External source token counts
  console.log(`\n8. EXTERNAL SOURCE TOKEN COUNTS:`);
  let extTotalTokens = 0;
  for (const src of externalCorpus.sources) {
    let urlDomain: string;
    try { urlDomain = new URL(src.url).hostname; } catch { urlDomain = src.url; }
    console.log(`   [${src.source_type}] ${src.token_count} tokens — ${urlDomain}`);
    extTotalTokens += src.token_count;
  }
  console.log(`   TOTAL EXTERNAL TOKENS: ${extTotalTokens}`);
  console.log(`   CORPUS GRAND TOTAL: ${siteTotalTokens + extTotalTokens} tokens`);

  // 9. Acquisition duration
  console.log(`\n9. ACQUISITION DURATION: ${totalDuration}ms`);
  console.log(`   Site corpus: ${t1e - t1}ms`);
  console.log(`   External research: ${t2e - t2}ms`);

  // 10. Sample excerpts (5 sources)
  console.log(`\n10. SAMPLE EXCERPTS (up to 5 sources):`);
  const allSources: Array<{ label: string; excerpt: string }> = [
    ...siteCorpus.pages.map(p => ({
      label: `[SITE/${p.page_type}]`,
      excerpt: p.raw_text.slice(0, 300),
    })),
    ...externalCorpus.sources.map(s => ({
      label: `[EXT/${s.source_type}]`,
      excerpt: s.excerpt.slice(0, 300),
    })),
  ];
  for (const { label, excerpt } of allSources.slice(0, 5)) {
    console.log(`\n  ${label}`);
    console.log(`  ${excerpt.replace(/\n/g, " ").trim()}`);
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------
  console.log(`\n${sep}`);
  console.log("ANALYSIS");
  console.log(sep);

  const hasHomepage = siteCorpus.pages.some(p => p.page_type === "homepage");
  const hasPricing = siteCorpus.pages.some(p => p.page_type === "pricing");
  const hasAbout = siteCorpus.pages.some(p => p.page_type === "about");
  const hasCustomerSignals = reviewCount > 0;
  const sourceTypes = new Set(externalCorpus.sources.map(s => s.source_type));
  const hasCompetitorData = sourceTypes.has("competitor_search_snippet");
  const hasFundingData = sourceTypes.has("funding_announcement") || sourceTypes.has("investor_mention");

  console.log(`\nIs the corpus healthy?`);
  const issues: string[] = [];
  if (!hasHomepage) issues.push("missing homepage");
  if (!hasPricing) issues.push("missing pricing page");
  if (!hasAbout) issues.push("missing about page");
  if (siteTotalTokens < 2000) issues.push("very sparse site content (<2k tokens)");
  if (externalCorpus.sources.length === 0) issues.push("no external sources");
  if (issues.length === 0) {
    console.log(`  ✓ YES — homepage, pricing, about present; ${externalCorpus.sources.length} external sources`);
  } else {
    console.log(`  ✗ ISSUES: ${issues.join(", ")}`);
  }

  console.log(`\nAre there obvious noise sources?`);
  const noiseTypes = ["competitor_search_snippet", "linkedin_snippet"];
  const noisySources = externalCorpus.sources.filter(s => noiseTypes.includes(s.source_type));
  if (noisySources.length === 0) {
    console.log(`  Minimal noise — no competitor snippets or LinkedIn summaries`);
  } else {
    console.log(`  ${noisySources.length} potentially noisy: ${noisySources.map(s => s.source_type).join(", ")}`);
    console.log(`  (These are Tier 4-5 and should not drive diagnosis alone)`);
  }

  console.log(`\nAre customer signals present?`);
  if (hasCustomerSignals) {
    console.log(`  ✓ YES — ${reviewCount} review sources (Tier 3 customer signal)`);
  } else {
    console.log(`  ✗ NO review sources — Tier 3 signals absent`);
    console.log(`  Risk: diagnosis may be driven entirely by company copy (Tier 1)`);
  }

  console.log(`\nIs the evidence diverse enough to support diagnosis?`);
  const diversityFactors: string[] = [];
  if (hasPricing) diversityFactors.push("pricing page");
  if (hasAbout) diversityFactors.push("about page");
  if (siteCorpus.pages.length >= 3) diversityFactors.push(`${siteCorpus.pages.length} site pages`);
  if (hasCustomerSignals) diversityFactors.push("customer reviews");
  if (pressCount > 0) diversityFactors.push(`${pressCount} press mentions`);
  if (hasCompetitorData) diversityFactors.push("competitor context");
  if (hasFundingData) diversityFactors.push("funding/investor signals");
  if (diversityFactors.length >= 4) {
    console.log(`  ✓ YES — diverse evidence: ${diversityFactors.join(", ")}`);
  } else if (diversityFactors.length >= 2) {
    console.log(`  MARGINAL — limited diversity: ${diversityFactors.join(", ")}`);
    console.log(`  Risk: diagnosis quality will be constrained`);
  } else {
    console.log(`  ✗ INSUFFICIENT — only: ${diversityFactors.join(", ") || "none"}`);
  }

  console.log(`\n${sep}\n`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
