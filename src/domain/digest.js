import { createHash } from 'node:crypto';

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function shortDigest(digest) {
  return typeof digest === 'string' ? digest.slice(0, 8) : '';
}

// Collapse whitespace so that harmless spacing changes do not count as rewording.
export function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function textSignature(text) {
  return sha256(normalizeText(text));
}
