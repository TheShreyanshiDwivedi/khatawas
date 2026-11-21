// Devanagari -> rough Roman, and a phonetic "skeleton" so "मोहन" and "Mohan" are the same customer.
const IND = { 'अ': 'A', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऋ': 'ri' };
const MAT = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ृ': 'ri' };
const CON = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h' };

export function toRoman(word) {
  const w = word.normalize('NFC').replace(/़/g, '');
  let out = '';
  const ch = [...w];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (CON[c]) {
      out += CON[c];
      const n = ch[i + 1];
      if (n && MAT[n]) { out += MAT[n]; i++; } else if (n === '्') i++; else out += '\u0001'; // inherent vowel marker
    } else if (IND[c]) out += IND[c] === 'A' ? 'a' : IND[c];
    else if (c === 'ं' || c === 'ँ') out += 'n';
    else if (c === 'ः') out += 'h';
    else if (!/[ऀ-ॿ]/.test(c)) out += c.toLowerCase();
  }
  out = out.replace(/\u0001$/, '').replace(/\u0001/g, 'a'); // drop word-final schwa
  return out;
}
export const isDevanagari = (s) => /[ऀ-ॿ]/.test(s);

export function skeleton(word) {
  return toRoman(word).toLowerCase().replace(/ph/g, 'f').replace(/w/g, 'v').replace(/[aeiouyh]/g, '').replace(/(.)\1+/g, '$1');
}
export const nameKey = (name) => name.toLowerCase().split(/\s+/).filter(Boolean).map(skeleton).join(' ');
export function displayName(name) {
  return name.split(/\s+/).map((w) => { const r = isDevanagari(w) ? toRoman(w) : w; return r.charAt(0).toUpperCase() + r.slice(1); }).join(' ');
}
