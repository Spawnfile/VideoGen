"""Senaryo → seslendirme klipleri + timeline.json + captions.json (bölüm 8, Enigma).

EMA Lightning (Apache 2.0, Türkçe, 48 kHz) ile her cümle için birkaç seed × hız üretilir; faster-whisper
(large-v3-turbo, GPU int8_float16) ile geri yazıya çevrilir, WER'i en düşük ve süresi hedefe en yakın aday seçilir.
Seçilen klipten kelime zamanları alınır, senaryodaki doğru yazımla eşlenir (ekranda ASR yazımı değil senaryo görünür).

  ../tts/run.sh tts/say.py            # tümü
  ../tts/run.sh tts/say.py s04 s11    # yalnız bu cümleleri yeniden üret
Çıktılar: tts/clips/<id>_<seed>_<speed>.wav (adaylar), tts/chosen/<id>.wav, tts/report.json,
          remotion/public/vo/vo.wav (tam anlatım), timeline.json, captions.json (kare cinsinden, 30 fps)
"""
import difflib
import json
import os
import re
import subprocess
import sys
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TTS = os.path.join(ROOT, "tts")
SR = 48000
SEEDS = [0, 1, 2, 3, 4]
SPEEDS = [1.0, 1.06]
WPS_TARGET = 2.55  # hedef konuşma hızı (kelime/sn)


ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
ORD = {"1": "birinci", "2": "ikinci", "3": "üçüncü", "4": "dördüncü", "5": "beşinci"}


def num_tr(n):
    """0–999 999 arası sayıyı Türkçe yazıya çevir (ASR rakam yazınca WER için)."""
    if n >= 1000:
        k, r = divmod(n, 1000)
        return ("" if k == 1 else num_tr(k) + " ") + "bin" + (" " + num_tr(r) if r else "")
    h, r = divmod(n, 100)
    out = ([] if h == 0 else (["yüz"] if h == 1 else [ONES[h], "yüz"])) + [TENS[r // 10], ONES[r % 10]]
    return " ".join(w for w in out if w)


def spell_numbers(s):
    s = re.sub(r"\b(\d)\.(?=\s+[A-ZÇĞİÖŞÜa-zçğıöşü])", lambda m: ORD.get(m.group(1), m.group(1)), s)
    return re.sub(r"\d+", lambda m: num_tr(int(m.group())), s)


def norm_words(s):
    s = spell_numbers(s)
    s = s.replace("’", "'").replace("â", "a").replace("î", "i").replace("û", "u")
    s = s.replace("I", "ı").replace("İ", "i").lower()
    s = re.sub(r"'\w*", "", s)  # ek ayrımı: "Savaşı'nda" → "savaşı" (ASR kesmeyi yazmayabilir)
    return re.findall(r"[a-zçğıöşü0-9]+", s)


def wer(ref, hyp):
    r, h = norm_words(ref), norm_words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def load16k(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def read_wav(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32767


def trim(x, thr=0.004, pad=0.03):
    """Baş/sondaki sessizliği kırp (kelime zamanları kırpılmış klibe göre)."""
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(x), idx[-1] + int(pad * SR))
    y = x[a:b].copy()
    f = int(0.006 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def level(x, target_db=-21.0):
    """Klipleri aynı konuşma seviyesine getir: 50 ms pencerelerden sessiz olmayanların RMS'i → hedef."""
    w = int(0.05 * SR)
    n = len(x) // w
    r = np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(axis=1))
    act = r[r > r.max() * 0.1]
    g = 10 ** (target_db / 20) / max(1e-6, np.sqrt((act ** 2).mean()))
    return np.tanh(x * g * 1.0) if np.abs(x * g).max() > 0.95 else x * g


def align_words(script_text, asr_words):
    """Senaryo kelimelerini (görünen yazım) ASR kelime zamanlarına eşle; eşlenemeyenleri ara değerle doldur."""
    shown = script_text.split()
    ref = [(norm_words(w) or [""])[0] if norm_words(w) else "" for w in shown]
    # birden fazla norm parçası olan kelime ("Savaşı'nda" tek) için ilk parça yeter
    hyp = [(norm_words(w["word"]) or [""])[0] for w in asr_words]
    sm = difflib.SequenceMatcher(a=ref, b=hyp, autojunk=False)
    times = [None] * len(shown)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                w = asr_words[j1 + k]
                times[i1 + k] = [w["start"], w["end"]]
        elif tag == "replace":  # n:m — aralığı karakter sayısına göre böl
            t0, t1 = asr_words[j1]["start"], asr_words[j2 - 1]["end"]
            L = [len(shown[i]) for i in range(i1, i2)]
            acc = 0
            for k, i in enumerate(range(i1, i2)):
                a = t0 + (t1 - t0) * acc / sum(L)
                acc += L[k]
                times[i] = [a, t0 + (t1 - t0) * acc / sum(L)]
    # boşlukları doldur
    for i in range(len(times)):
        if times[i] is None:
            prev = next((times[j][1] for j in range(i - 1, -1, -1) if times[j]), 0.0)
            nxt = next((times[j][0] for j in range(i + 1, len(times)) if times[j]), prev + 0.3)
            n = 1
            while i + n < len(times) and times[i + n] is None:
                n += 1
            step = (nxt - prev) / n
            for k in range(n):
                times[i + k] = [prev + step * k, prev + step * (k + 1)]
    return [{"text": shown[i], "start": round(t[0], 3), "end": round(t[1], 3)} for i, t in enumerate(times)]


def main():
    script = json.load(open(os.path.join(ROOT, "script.json")))
    only = set(sys.argv[1:])
    os.makedirs(os.path.join(TTS, "clips"), exist_ok=True)
    os.makedirs(os.path.join(TTS, "chosen"), exist_ok=True)
    rep_path = os.path.join(TTS, "report.json")
    report = json.load(open(rep_path)) if os.path.exists(rep_path) else {}

    from ema_lightning import EMA
    from faster_whisper import WhisperModel

    tts = EMA()
    asr = WhisperModel("large-v3-turbo", device="cuda", compute_type="int8_float16")

    def transcribe(path):
        segs, _ = asr.transcribe(load16k(path), language="tr", word_timestamps=True, beam_size=5,
                                 condition_on_previous_text=False)
        words, text = [], ""
        for s in segs:
            text += s.text
            words += [{"word": w.word.strip(), "start": float(w.start), "end": float(w.end)} for w in s.words]
        return text.strip(), words

    for s in script["sentences"]:
        sid, text = s["id"], s["text"]
        if only and sid not in only:
            continue
        n = len(text.split())
        cands = []
        for sp in SPEEDS:
            for seed in SEEDS:
                p = os.path.join(TTS, "clips", f"{sid}_{seed}_{sp}.wav")
                sp_ = tts.say(text, seed=seed, speed=sp)
                write_wav(p, trim(np.asarray(sp_.audio, np.float32)))
                hyp, words = transcribe(p)
                dur = len(read_wav(p)) / SR
                cands.append(dict(path=p, seed=seed, speed=sp, dur=round(dur, 3), hyp=hyp, wer=round(wer(text, hyp), 3),
                                  words=words))
        target = n / WPS_TARGET
        best = min(cands, key=lambda c: (c["wer"], abs(c["dur"] - target)))
        x = read_wav(best["path"])
        write_wav(os.path.join(TTS, "chosen", f"{sid}.wav"), x)
        report[sid] = dict(text=text, target=round(target, 2), chosen=best["path"].rsplit("/", 1)[1],
                           dur=best["dur"], wer=best["wer"], hyp=best["hyp"], words=best["words"],
                           cands=[{k: c[k] for k in ("seed", "speed", "dur", "wer", "hyp")} for c in cands])
        print(f"{sid} wer={best['wer']:.3f} dur={best['dur']:.2f}/{target:.2f} seed={best['seed']} sp={best['speed']} | {best['hyp']}",
              flush=True)
        json.dump(report, open(rep_path, "w"), ensure_ascii=False, indent=1)

    build_timeline(script, report)


def build_timeline(script, report):
    fps = script["fps"]
    t = script["lead_in_s"]
    clips, caps = [], []
    prev_beat = None
    chunks = []
    for s in script["sentences"]:
        sid = s["id"]
        r = report[sid]
        if prev_beat is not None:
            t += script["gap_s"]["same_beat" if s["beat"] == prev_beat else "new_beat"]
        prev_beat = s["beat"]
        x = level(read_wav(os.path.join(TTS, "chosen", f"{sid}.wav")))
        dur = len(x) / SR
        words = align_words(s["text"], r["words"])
        start_f = round(t * fps)
        t = start_f / fps  # klip başlangıcı tam kareye otursun (ses ile kare hizalı)
        chunks.append((t, x))
        clips.append(dict(id=sid, beat=s["beat"], text=s["text"], start=start_f, end=round((t + dur) * fps),
                          dur_s=round(dur, 3)))
        for w in words:
            caps.append(dict(id=sid, text=w["text"], start=round((t + w["start"]) * fps, 2),
                             end=round((t + w["end"]) * fps, 2)))
        t += dur
    tail = 1.6  # CTA sonrası döngüye dönüş
    total_f = int(round((t + tail) * fps))
    vo = np.zeros(int(total_f / fps * SR) + SR, np.float32)
    for t0, x in chunks:
        a = int(round(t0 * SR))
        vo[a:a + len(x)] += x
    vo = vo[: int(total_f / fps * SR)]
    os.makedirs(os.path.join(ROOT, "remotion", "public", "vo"), exist_ok=True)
    vo_path = os.path.join(ROOT, "remotion", "public", "vo", "vo.wav")
    write_wav(vo_path + ".raw.wav", vo)
    # hafif kompresör: konuşmanın anlık tepeleri medyan + ~3 dB (ebur128 M)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", vo_path + ".raw.wav", "-af",
                    "acompressor=threshold=-26dB:ratio=3:attack=5:release=120:makeup=2,equalizer=f=7600:t=q:w=1.4:g=-4",
                    "-ar", str(SR), "-c:a", "pcm_s16le", vo_path], check=True)
    os.remove(vo_path + ".raw.wav")
    beats = {}
    for c in clips:
        b = beats.setdefault(c["beat"], [c["start"], c["end"]])
        b[0], b[1] = min(b[0], c["start"]), max(b[1], c["end"])
    tl = dict(fps=fps, frames=total_f, clips=clips, beats=beats)
    json.dump(tl, open(os.path.join(ROOT, "timeline.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(caps, open(os.path.join(ROOT, "captions.json"), "w"), ensure_ascii=False, indent=1)
    print(f"timeline: {total_f} kare = {total_f / fps:.2f} sn, {len(caps)} kelime")
    for b, (a, e) in beats.items():
        print(f"  {b:8} {a:5}–{e:5}  ({a / fps:5.2f}–{e / fps:5.2f} sn)")


if __name__ == "__main__":
    if sys.argv[1:] == ["--timeline"]:
        build_timeline(json.load(open(os.path.join(ROOT, "script.json"))),
                       json.load(open(os.path.join(TTS, "report.json"))))
    else:
        main()
