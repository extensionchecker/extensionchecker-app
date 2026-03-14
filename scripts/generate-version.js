/**
 * Generates a version.txt file with format: yy.Mdd.Hmm
 *   yy  = 2-digit year
 *   M   = month without leading zero (1-12)
 *   dd  = day with leading zero (01-31)
 *   H   = hour without leading zero (0-23)
 *   mm  = minute with leading zero (00-59)
 *
 * Example: 26.314.852 = 2026, March 14, 8:52 AM
 *
 * Usage: node scripts/generate-version.js [outDir]
 *   outDir defaults to src/frontend/dist
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const now = new Date();
const yy = String(now.getUTCFullYear()).slice(-2);
const M = String(now.getUTCMonth() + 1);           // no leading zero
const dd = String(now.getUTCDate()).padStart(2, '0');
const H = String(now.getUTCHours());                // no leading zero
const mm = String(now.getUTCMinutes()).padStart(2, '0');

const version = `${yy}.${M}${dd}.${H}${mm}`;

const outDir = process.argv[2] || join(import.meta.dirname, '..', 'src', 'frontend', 'dist');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'version.txt');
writeFileSync(outPath, version + '\n', 'utf-8');

console.log(`version.txt → ${outPath} (${version})`);
