/**
 * Verbose acquisition audit — prints full excerpts for all external sources.
 * Run after run-acquisition-audit.ts to inspect source quality.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../../.env");
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {}

import type { SiteCorpusAcquisitionInput, SiteCorpusProvider } from "../intelligence-v3/acquisition/site-corpus.js";
import { siteCorpusAcquisition } from "../intelligence-v3/acquisition/site-corpus.js";
import { externalResearchAcquisition } from "../intelligence-v3/acquisition/external-research.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const fetchProvider: SiteCorpusProvider = {
  acquisition_method: "webfetch",
  async fetchPage(url: string) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HailMaryBot/1.0)" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return { text: "", success: false };
      const html = await res.text();
      const text = stripHtml(html);
      return { text, success: text.length > 100 };
    } catch {
      return { text: "", success: false };
    }
  },
};

async function main() {
  const [, , company = "Trigger.dev", domain = "trigger.dev"] = process.argv;

  const siteCorpus = await siteCorpusAcquisition({
    domain,
    provider: fetchProvider,
  } as SiteCorpusAcquisitionInput);

  const externalCorpus = await externalResearchAcquisition({ company, domain });

  console.log("\n=== FULL SITE PAGE CONTENT SAMPLES ===\n");
  for (const p of siteCorpus.pages) {
    console.log(`\n[${p.page_type.toUpperCase()}] ${p.url} (${p.token_count} tokens, tier=${p.source_tier})`);
    console.log("---");
    console.log(p.raw_text.slice(0, 600));
    console.log("...");
  }

  console.log("\n\n=== ALL EXTERNAL SOURCES — FULL EXCERPTS ===\n");
  for (const [i, src] of externalCorpus.sources.entries()) {
    console.log(`\n[${i + 1}/${externalCorpus.sources.length}] ${src.source_type} | tier=${src.source_tier} | ${src.token_count} tokens`);
    console.log(`URL: ${src.url}`);
    console.log(`Excerpt: ${src.excerpt}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
