/**
 * Detects obfuscation indicators:
 *   - atob() calls (Base64 decode — common for hiding payload strings)
 *   - Packed eval patterns (Dean Edwards p,a,c,k,e,d packer signature)
 *   - Hex-encoded string arrays (5+ consecutive hex strings in a literal array)
 *
 * Obfuscation itself is not malicious, but it is a deliberate signal that the
 * author chose to hide readable intent. Combined with other signals it elevates
 * aggregate risk. Standalone obfuscation findings are low severity.
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const ATOB_RE = /\batob\s*\(/g;
// Dean Edwards p,a,c,k,e,d packer: eval(function(p,a,c,k,e,... pattern
const EVAL_PACK_RE = /\beval\s*\(\s*function\s*\(\s*[a-zA-Z]\s*,\s*[a-zA-Z]/g;
// 5 or more consecutive quoted hex strings in an array literal
const HEX_ARRAY_RE = /\[\s*(?:"0x[0-9a-fA-F]+"|\s*,\s*"0x[0-9a-fA-F]+")+\s*\]/g;

export function detectObfuscation(path: string, content: string): CodeFinding[] {
  return [
    ...findMatches(content, ATOB_RE, path, 'obfuscation_atob'),
    ...findMatches(content, EVAL_PACK_RE, path, 'obfuscation_eval_pack'),
    ...findMatches(content, HEX_ARRAY_RE, path, 'obfuscation_hex_array')
  ];
}
