# Enigma — "Bu makinenin minicik bir zaafı vardı" (bölüm 8)

Yeni format: **nesne + hikâye + Türkçe yapay zekâ seslendirme + karaoke altyazı**, 52 sn. Hat: senaryo (`script.json`) →
EMA Lightning seslendirme + faster-whisper seçimi/kelime zamanları (`timeline.json`, `captions.json`) → Blender bpy
(zamanlar kelime karelerinden) → `anchors.json` → Remotion (karaoke, etiketler, paneller, ses) → iki geçişli loudnorm.
Konsept puanları, farklılaşma ve doğrulanan bilgiler: `PLAN.md`.

3D model (Sketchfab, **CC BY 4.0**; `blender/asset_dl/enigma.glb`, `blender/enigma_assets.py`):
- "Enigma Machine" — **ASHISH (Ashish0096)**, uid 30b85c037a164174a109ad6f002b9c47 → kasa + kapak, klavye, lamba paneli,
  rotor kapağı, priz paneli. Dokularda amblem yok. Parçalar numaralarına göre 7 katmana ayrılır; basılan tuşlar (A, E, N, I,
  G, M) `split_faces` ile ayrılıp basış boşuna bağlanır. Kapağın iç yüzüne pirinç **WHAT'S INSIDE / @whatsinit.lab** plakası.
- Kodla (`blender/rotors.py`): 3 rotor (gerçek Enigma I I/II/III kablolaması, alfabe halkası, tırtıllı çark, 26 pim + 26 pul,
  26 tel), UKW-B reflektör (açık halka, 13 U-tel), giriş tekerleği, 26 lamba. `encipher()` simülatörü lambaları, adımları ve
  parlayan telleri belirler (doğrulama: "AAAAAAAAAA" → "BDZGOWCXLT").

```bash
cd episodes/enigma
# 0) seslendirme (Python 3.12 venv: ayrı bir TTS venv (VideoGen'in parçası değil); EMA CPU torch, Whisper GPU — run.sh LD_LIBRARY_PATH'i kurar)
../tts/run.sh tts/say.py                  # 15 cümle × 5 seed × 2 hız, WER + süre ile seçim → timeline/captions/vo.wav (~2 dk)
../tts/run.sh tts/say.py s04              # tek cümleyi yeniden üret;  --timeline: yalnız zaman çizelgesi + vo.wav
# 1) sahne + çapalar (+ ön izleme / taslak)
blender-gpu -b --factory-startup -P blender/scene.py -- --preview --frames 20,520,720,860
blender-gpu -b --factory-startup -P blender/scene.py -- --draft          # %25, ~3 dk → blender/out/draft
cp blender/out/anchors.json remotion/src/ && cp timeline.json captions.json remotion/src/
# 2) ses
python3 audio/music.py remotion/public/sfx/music.wav blender/out/anchors.json     # klavye müziği, yeni bölüm zamanları
../tts/run.sh audio/duck.py remotion/public/sfx/music.wav remotion/public/vo/vo.wav remotion/public/sfx/music_duck.wav
python3 audio/sfx.py remotion/public/sfx
# 3) tam render (disk dostu: 150 karelik PNG parçaları → WebP q92 → remotion/public/frames, ~2,2 sn/kare ≈ 1 sa)
blender/render.sh            # veya aralık: blender/render.sh 640 920
# 4) Remotion → MP4 → iki geçişli loudnorm (-14 LUFS, tepe -1,5 dBTP)
cd remotion && npx remotion render EnigmaIcinde out/raw.mp4 --codec=h264 --crf=18
# 5) QA: anlaşılırlık (WER) + altyazı senkronu final MP4'ten
cd .. && ../tts/run.sh tts/qa.py remotion/out/enigma.mp4
```

## Kurgu (30 fps, 1569 kare = 52,3 sn; kareler seslendirmeden)

| Kare | Vuruş | Görüntü | Ekran |
|---|---|---|---|
| 0–144 | Kanca (s01–s02) | Makine tam kadraj, A tuşu iki kez → B, D lambaları | 🔒 Zaafı neydi? · 🔊 yapay zekâ rozeti · karaoke |
| 154–269 | Bağlam (s03) | Yavaş tur, makinede E-N-I-G-M-A yazılır → lambalar C S D Z O X | Yazılan / Lambada şeridi |
| 278–397 | Kriz (s04) | Kamera rotor kapağına yaklaşır | 158.962.555.217.826.360.000 sayacı, "≈ 159 kentilyon" |
| 406–488 | Nesne (s05) | "…içinde ne var?" → 7 katman dalga patlatma | — |
| 472–661 | İçine bakalım (s06–s07) | Sinyal yolu tuş → priz → 3 rotor → reflektör → geri → B lambası | 1 Klavye · 2 Priz paneli · 3 rotor · 4 Reflektör · 5 Lamba paneli |
| 665–777 | Rotor (s08) | Katmanlar çekilir, rotor grubu dikleşir + açılır, X-ray; 3 basış, parlayan gerçek teller | AAAA → BDZG |
| 787–913 | Aha (s09–s10) | Reflektör yakın plan (U-teller), zoom-punch + flaş | A → A ✕ · 🔓 ZAAF rozeti |
| 915–1272 | Çözüm (s11–s13) | Üst plaka kalkık, rotorlar yerinde; Bombe anında hızla döner | 🇵🇱 / 🇬🇧 çipleri, kelime tahmini paneli (WETTERBERICHT, ✕✓) |
| 1282–1429 | Vay (s14) | Makine kapanır, kamera döner | 📅 25–26 Temmuz 1939 · savaştan 5 hafta önce |
| 1439–1568 | CTA + döngü (s15) | Kanca kadrajı, kapak plakası parlar | 💬 Yorumlara yaz 👇 (son kare = ilk kare) |

Sesler: anlatım (EMA Lightning, Apache 2.0) seviye eşitlenmiş + hafif kompresör; müzik = klavye müziği (120 BPM) yeniden
zamanlı, konuşma altında sidechain −10 dB (atak 80 ms, bırakma 250 ms); efektler sabit perdeli sinüs (tuş 180 Hz, lamba 392,
etiket 523, patlatma/dalış 70, ✕ 196, ✓ 587, CTA 523→659). İlk 2 sn efekt yok.

## Kaynaklar
- AMS Feature Column, "The Enigma machine" (ayar sayısı, reflektör, crib): https://www.ams.org/samplings/feature-column/fcarc-enigma
- GCHQ, The Pyry forest meeting (25–26 Temmuz 1939): https://www.gchq.gov.uk/information/the-pyry-forest-meeting
- Britannica, Bombe (Turing 1939, Mart 1940, Polonya bombası): https://britannica.com/topic/Bombe
- EMA Lightning model kartı (Apache 2.0, yapay zekâ sesi bildirimi): https://huggingface.co/canberkkkkkk/ema-lightning
