"""Final MP4 kalite kontrolü (ses): anlaşılırlık (WER, müzik altında) + altyazı senkronu.

  ../tts/run.sh tts/qa.py remotion/out/enigma.mp4
- Final videonun sesini faster-whisper (GPU) ile yazıya çevirir, senaryoyla WER (sayılar yazıya çevrilerek) hesaplar.
- captions.json'daki kelime başlangıçlarını (Remotion'da vurgunun başladığı kare) ASR kelime başlangıçlarıyla karşılaştırır:
  rastgele 5 kelime + tüm eşleşen kelimelerin medyan/maks kayması (kare).
"""
import difflib
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import say  # noqa: E402

ROOT = say.ROOT
video = sys.argv[1]
script = json.load(open(os.path.join(ROOT, "script.json")))
caps = json.load(open(os.path.join(ROOT, "captions.json")))
ref = " ".join(s["text"] for s in script["sentences"])

from faster_whisper import WhisperModel  # noqa: E402

asr = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8_float16")
segs, _ = asr.transcribe(say.load16k(video), language="tr", word_timestamps=True, beam_size=5,
                         condition_on_previous_text=False)
words, hyp = [], ""
for s in segs:
    hyp += s.text
    words += [(w.word.strip(), w.start) for w in s.words]
w = say.wer(ref, hyp)
print(f"WER (final, müzik + efekt altında): {w * 100:.2f}%  ({len(say.norm_words(ref))} kelime)")
print("ASR:", hyp.strip())

# senkron: senaryo kelimesi ↔ ASR kelimesi (normalize eşleşme)
cn = [(say.norm_words(c["text"]) or [""])[0] for c in caps]
hn = [(say.norm_words(t) or [""])[0] for t, _ in words]
sm = difflib.SequenceMatcher(a=cn, b=hn, autojunk=False)
pairs = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal":
        for k in range(i2 - i1):
            c = caps[i1 + k]
            pairs.append((c["text"], c["start"], words[j1 + k][1] * 30))
d = [abs(a - b) for _, a, b in pairs]
d.sort()
print(f"senkron: {len(pairs)} kelime eşleşti, medyan kayma {d[len(d) // 2]:.2f} kare, maks {d[-1]:.2f} kare")
print("en büyük 4:", [(t, round(a - b, 1)) for t, a, b in sorted(pairs, key=lambda p: -abs(p[1] - p[2]))[:4]])
random.seed(8)
for t, a, b in random.sample(pairs, 5):
    print(f"  {t:16} altyazı {a:7.1f}  ses {b:7.1f}  fark {a - b:+.2f} kare")
