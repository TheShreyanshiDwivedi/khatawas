// Spoken-number parsing for Hindi / Hinglish / English. Returns an integer or null.
const SMALL = {};
const hi = ['ek','do','teen','chaar','paanch','chhe','saat','aath','nau','das','gyarah','barah','terah','chaudah','pandrah','solah','satrah','atharah','unnis','bees',
'ikkis','baais','teis','chaubis','pachchis','chhabbis','sattais','atthais','untis','tees',
'ikattis','battis','taintis','chauntis','paintis','chhattis','saintis','adtis','untalis','chaalis',
'iktalis','bayalis','taintalis','chauwalis','paintalis','chiyalis','saintalis','adtalis','unchas','pachas',
'ikyavan','bavan','trepan','chauvan','pachpan','chappan','sattavan','atthavan','unsath','saath',
'iksath','basath','tresath','chausath','painsath','chhiyasath','sarsath','arsath','unhattar','sattar',
'ikhattar','bahattar','tihattar','chauhattar','pachhattar','chhihattar','satattar','athattar','unasi','assi',
'ikyasi','bayasi','tirasi','chauraasi','pachasi','chhiyasi','sattasi','atthasi','navasi','nabbe',
'ikyanve','bayanve','tiranve','chauranve','pachanve','chhiyanve','sattanve','atthanve','ninyanve'];
hi.forEach((w, i) => { SMALL[w] = i + 1; });
Object.assign(SMALL, {
  teen3: 3, tin: 3, char: 4, panch: 5, chhah: 6, che: 6, chha: 6, sath: 7, ath: 8, no: null,
  chalis: 40, chaalees: 40, pachaas: 50, saath_: 60, sattar_: 70, assi_: 80, nabbe_: 90,
  bis: 20, bees_: 20, tis: 30, tees_: 30, pachees: 25, pacchis: 25, pachis: 25,
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
});
delete SMALL.no; delete SMALL.saath_; delete SMALL.sattar_; delete SMALL.assi_; delete SMALL.nabbe_;
delete SMALL.bees_; delete SMALL.tees_; delete SMALL.teen3;
const MULT = { [canon('सौ')]: 100, [canon('हज़ार')]: 1000, [canon('हजार')]: 1000, [canon('लाख')]: 100000, sau: 100, sao: 100, hundred: 100, hazaar: 1000, hazar: 1000, thousand: 1000, lakh: 100000, lac: 100000 };
const FRAC = { dedh: 150, dhai: 250, dhaai: 250, [canon('डेढ़')]: 150, [canon('डेढ')]: 150, [canon('ढाई')]: 250 }; // dedh sau = 150, dhai sau = 250
const SAADE = { saade: 0.5, [canon('साढ़े')]: 0.5, [canon('साढे')]: 0.5 }; // saade teen sau = 350

const DEV = '०१२३४५६७८९';

// Canonical form for matching Devanagari: NFC, drop nukta, chandrabindu -> anusvara.
export function canon(t) {
  return t.normalize('NFC').normalize('NFD').replace(/\u093c/g, '').normalize('NFC').replace(/\u0901/g, '\u0902');
}
const DEV_NUM = ('एक दो तीन चार पांच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस ' +
 'इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस ' +
 'इकतालीस बयालीस तैंतालीस चौवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ ' +
 'इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी अस्सी ' +
 'इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे').split(' ');
export function normalizeDigits(s) {
  return s.replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));
}

export function isNumberToken(t) {
  return /^\d+$/.test(t) || t in SMALL || t in MULT || t in FRAC || t in SAADE;
}

// Parse a run of number tokens into a value. Handles "teen sau chaalis", "three forty",
// "do hazaar paanch sau", "saade teen sau", "dedh sau", "1 lakh".
export function parseNumberRun(tokens) {
  let total = 0, cur = 0, sawMult = false, saade = false, lastSmall = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      const v = Number(t);
      cur += v; lastSmall = v; continue;
    }
    if (t in SAADE) { saade = true; continue; }
    if (t in FRAC) { cur = FRAC[t]; sawMult = true; if (tokens[i + 1] === 'sau' || tokens[i + 1] === canon('सौ')) i++; continue; }
    if (t in MULT) {
      const m = MULT[t];
      if (saade) { cur = (cur + 0.5) * m; saade = false; sawMult = true; continue; }
      if (m === 100) { cur = (cur || 1) * 100; sawMult = true; }
      else { total += (cur || 1) * m; cur = 0; sawMult = false; }
      continue;
    }
    if (t in SMALL) {
      const v = SMALL[t];
      // colloquial "three forty" => 340 (single digit followed by 20..99, no multiplier yet)
      if (!sawMult && cur >= 1 && cur <= 9 && v >= 20 && lastSmall !== null && lastSmall <= 9) {
        cur = cur * 100 + v;
      } else cur += v;
      lastSmall = v; continue;
    }
  }
  const out = total + cur;
  return Number.isFinite(out) && out > 0 ? Math.round(out) : null;
}

// Find the first number in a token list; returns { value, start, end } or null.
export function findAmount(tokens) {
  tokens = tokens.map(canon);
  for (let i = 0; i < tokens.length; i++) {
    if (!isNumberToken(tokens[i])) continue;
    // saade/dedh/dhai may begin a run
    let j = i;
    while (j < tokens.length && isNumberToken(tokens[j])) j++;
    const value = parseNumberRun(tokens.slice(i, j));
    if (value) return { value, start: i, end: j };
    i = j - 1;
  }
  return null;
}

// Devanagari entries (added last: DEV_NUM is defined above this point in the file)
DEV_NUM.forEach((w, i) => { SMALL[canon(w)] = i + 1; });
Object.assign(SMALL, { [canon('पाँच')]: 5, [canon('छः')]: 6, [canon('छे')]: 6, [canon('पन्द्रह')]: 15, [canon('पंद्रह')]: 15, [canon('छ')]: 6 });
