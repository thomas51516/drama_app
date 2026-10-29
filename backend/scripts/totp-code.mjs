#!/usr/bin/env node
// Outil de développement : affiche le code TOTP courant pour une clé secrète base32.
// Usage : node backend/scripts/totp-code.mjs <CLE_SECRETE>
import { createHmac } from 'node:crypto';

const secret = (process.argv[2] ?? '').toUpperCase().replace(/[\s=-]/g, '').replace(/0/g, 'O').replace(/1/g, 'I');
if (!secret) {
  console.error('Usage : node backend/scripts/totp-code.mjs <CLE_SECRETE>');
  process.exit(1);
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = '';
for (const c of secret) {
  const v = alphabet.indexOf(c);
  if (v < 0) { console.error(`Caractère invalide dans la clé : ${c}`); process.exit(1); }
  bits += v.toString(2).padStart(5, '0');
}
const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
const code = (counter) => {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};
const now = Math.floor(Date.now() / 1000);
const step = Math.floor(now / 30);
console.log(`Code actuel : ${code(step)}   (valable encore ${30 - (now % 30)} s)`);
console.log(`Code suivant : ${code(step + 1)}`);
