# Benchmark (2026-11-21)

Real Gnani calls: Timbre v3.0 speaks each test sentence, Prisma v3.0 transcribes it, then the parser (and Qwen2.5-1.5B for unclear clauses) reads it. 32 sentences, each run twice: **clean**, and **noisy** (synthetic pink noise + overlapping voices of other speakers, SNR 5 dB). Raw data: `benchmark.json`; first run before fixes: `benchmark-run1-before-fixes.json`.

| | Clean | Noisy (5 dB) |
|---|---|---|
| Sentences fully correct (kind + amount + customer) | 32 / 32 | 20 / 32 |
| Amount exact (of sentences with an amount) | 29 / 29 | 25 / 29 |
| Credit vs payment direction right | 29 / 29 | 25 / 29 |

| Latency (measured) | Median | 95th percentile |
|---|---|---|
| Prisma: end of speech -> final transcript | ~270-300 ms | ~380-450 ms |
| Rules parser (per sentence) | ~1 ms | < 10 ms (first call) |
| Timbre: reply text -> first audio (n = 10) | 430 ms | 939 ms |
| Qwen2.5-1.5B fallback, when needed | ~260-350 ms | |

Typical end-of-speech -> first spoken reply is therefore roughly 0.7-0.8 s (Prisma + parse + Timbre first audio). This sums medians, excludes the browser <-> our server hop and the Qwen call (when used), and was measured with short sentences.

## Honest caveats
- **Test audio is synthetic** (Timbre voices, 4 of them), not real shopkeepers, and the noise is synthetic, not recorded in a shop. Treat the noisy numbers as a stress test, not a field result.
- **The parser was tuned after run 1.** Run 1 (24 sentences) scored 17/24 clean and 9/24 noisy. I fixed the bugs it exposed (number words as names, "kar do" read as 2, "dedh hazaar", Devanagari/Latin name matching, comma splitting) and re-ran with 8 new held-out sentences. Held-out clean: all 7 amounts exact, 7/8 sentences fully right as first run (one phonetic name bug, फरीदा vs Farida, fixed afterwards), held-out noisy: 4/8 fully right, all 7 amounts exact.
- **Whole-sentence scoring** uses phonetic name matching (राजेश == Rajesh), which is what the app does.
- **Most remaining noisy failures are Prisma mishearing**, not parser bugs: it inserts names from the background babble ("Imran ने तीन सौ पचास ... जमा किए" for Farida), adds a spurious "नहीं", or mishears "saman" as "सम्मान". The app cannot recover from a wrong transcript. Showing the transcript on screen, and asking back when unsure, is the mitigation.
- Re-scoring after later parser changes is done offline from the stored transcripts: `npm run rescore` (no Gnani calls).
