# Sabitlenmiş kaynaklar (2026-10-06)

| Paket | Kaynak | Commit |
|---|---|---|
| chatterbox-tts | github.com/resemble-ai/chatterbox | 5de7a54aa4e5e2baadb0182dde554908b48b85c2 |
| FreyaTTS | github.com/freyavoiceai/FreyaTTS | 146d36c1cb6660646be57d31339db4eed9315de3 |
| Chatterbox ağırlıkları (HF `ResembleAI/chatterbox`) | `~/videogen-data/models/chatterbox/` | 5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18 |

## Yeniden kurulum (2026-10-06)

Tüm geçişli bağımlılıklar `requirements.freeze.txt` içinde sabitlenmiştir (`uv pip freeze`; git kaynaklı paketler `name @ git+URL@SHA`: chatterbox-tts, resemble-perth). Kendi paketimiz (editable) dosyada yoktur.

- Python: 3.12.13 (uv yönetimli)
- torch 2.6.0 / torchaudio 2.6.0: PyPI'nin varsayılan linux x86_64 tekerlekleri (CUDA 12.4, `+cu124`); ayrı index kullanılmadı, `--index-url` gerekmez.
- Sürücü: 595.91.07 (CUDA 13.2), RTX 3060 Laptop; `torch.cuda.is_available()` True.

```bash
cd python/audio_service
uv venv .venv -p 3.12
uv pip install --python .venv -r requirements.freeze.txt
uv pip install --python .venv --no-deps -e .
```

**Uyarı: `uv sync` kullanmayın (chatterbox/torch pyproject'te yok; sync bunları siler).** Yalnızca `uv pip install --python .venv …` kullanın; `--no-deps -e .` adımı bağımlılıklara dokunmadan paketi (`audio_service`) editable kurar.

Doğrulama: `uv pip install --dry-run -r requirements.freeze.txt` temiz bir 3.12 venv'inde çözülür (indirme yapılmadan denendi; tam kurulum yeniden denenmedi, disk dar).

## Düzeltmeler ve model anlık görüntüleri (2026-10-06, M1 Görev 4)

- **av==16.1.0**: av 19.x faster-whisper 1.2.1 ile WAV çözemiyor (`av.open(..., metadata_errors=...)` TypeError) → `requirements.freeze.txt` içinde `av==16.1.0`.
- **HF_HOME bu makinede kullanıcının `~/gpu-server/hf-cache` dizinidir.** Freya ağırlıkları `~/videogen-data/models` altında DEĞİL, bu önbellekte durur (Chatterbox ağırlıkları `~/videogen-data/models/chatterbox`).
- Kullanılan HF anlık görüntüleri (`$HF_HOME/hub/models--*/snapshots/<hash>`):
  - `freyavoice/freya-tts` @ `d124e07493615208f58bdd21d432736849ee4230` (config.json, model.safetensors)
  - `openbmb/VoxCPM2` @ `32279effe8c19989596f05d353d1447f51d9e915` (yalnızca `audiovae.pth`, Freya VAE'si)
  - `mobiuslabsgmbh/faster-whisper-large-v3-turbo` @ `0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf` (ASR; `align.WHISPER_REVISION` olarak koda sabitlendi)
- Freya venv: `~/videogen-data/venvs/freya` (Python 3.12 — `audio_service` `requires-python >=3.12,<3.13`; torch==2.6.0, voxcpm==2.0.3 --no-deps, FreyaTTS kaynağı `~/videogen-data/src/FreyaTTS` @ 146d36c, `.pth` ile).
- `align.transcribe_words` Whisper'ı sabit revizyonla (`revision=0a363e91…`) ve açık bir hub önbelleğiyle (`download_root`) yükler: açık argüman > `$HF_HOME/hub` > varsayılan `~/videogen-data/models/hf/hub`. `HF_HOME` bu makinede yalnızca `~/.bashrc`'nin etkileşimli bölümünde export edildiği için etkileşimsiz bir işçi onu görmez; servis `HF_HOME`/`download_root`'u kendisi vermelidir (aksi hâlde varsayılana yeniden indirir). Mevcut ağırlıklar taşınmadı.

## Ses CLI'ı (M5c, Görev 3)

- `python -m audio_service.voice_cli --job <job.json>`: iş başına bir süreç (TTS yüklenir → boşaltılır → Whisper yüklenir → boşaltılır; süreç çıkışı VRAM'i bırakır). Çıkış kodları: 0 tamam, 2 geçersiz iş (stderr Türkçe), 3 CUDA ya da ağırlık yok, 4 CER kapısı (`result.json` yine yazılır). stdout `VG_PROGRESS <done> <total>`, toplam = 2 × satır.
- Ortam (sürücü verir; boş env + `PATH`, `HOME`, `LANG`): `HF_HOME` (yoksa `~/videogen-data/models/hf`), `VG_MODELS_DIR` (yoksa `~/videogen-data/models`), `HF_HUB_OFFLINE=1` (CLI kendisi de zorlar).
- Beklenen ağırlıklar: Chatterbox `$VG_MODELS_DIR/chatterbox/{t3_mtl23ls_v3.safetensors,s3gen.pt,ve.pt,conds.pt}`; Whisper `$HF_HOME/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo` (revizyon `align.WHISPER_REVISION`); Freya `$HF_HOME/hub/models--freyavoice--freya-tts` (Freya kendi venv'inde: `~/videogen-data/venvs/freya`, CLI aynı modülle oradan çalıştırılır).
- Satır önbelleği `cache_dir/<sha>.wav` + `.json` (anahtar: normalleşmiş metin, yazılı metin, tohum, motor, ses [klon: referans WAV sha256], motor commit'i, Whisper revizyonu). Commit değişince ya da bu pinler güncellenince anahtar değişir: `tts.PINS` ile birlikte güncelleyin.
- Yeniden örnekleme `soxr` (requirements.freeze.txt'te geçişli: librosa) ile; yoksa doğrusal (yalnız test ortamı). Test: `cd python/audio_service && .venv/bin/pytest -q` (GPU ve model gerekmez; `torch`, `chatterbox`, `freyatts`, `faster_whisper` sahte).
- Çıkış kodu 5 = beklenmeyen çökme (stderr'in son satırı `Ses üretimi başarısız: <Tür>: <ileti>`); CUDA bellek yetersizliği (`OutOfMemoryError` ya da "out of memory") 3'e eşlenir. SIGTERM `SystemExit(143)` olarak işlenir, modeller boşaltılır. Önbellek anahtarına çıktı örnekleme hızı ve `voice_cli.CACHE_VERSION` da girer: kırpma eşiği/dolgusu ya da `tts.py` motor parametreleri değişirse `CACHE_VERSION`'ı artırın.
- **Freya venv (`~/videogen-data/venvs/freya`) gereksinimleri**: `faster-whisper==1.2.1`, `av==16.1.0` (19.x WAV açamaz), `soundfile`, `numpy`, `soxr`, ve `uv pip install --no-deps -e python/audio_service` (CLI Whisper'ı da aynı süreçte çalıştırır). Eksik paket CLI'da çıkış 3 + paket adıyla Türkçe ileti verir. **T4/T12: CLI'ı bu venv'de de gerçek bir iş koşturarak (duman testi) doğrulayın**; testler yalnızca sahte modüllerle çalışır.
