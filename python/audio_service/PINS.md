# Sabitlenmiş kaynaklar (2026-10-06)

| Paket | Kaynak | Commit |
|---|---|---|
| chatterbox-tts | github.com/resemble-ai/chatterbox | 5de7a54aa4e5e2baadb0182dde554908b48b85c2 |
| FreyaTTS | github.com/freyavoiceai/FreyaTTS | 146d36c1cb6660646be57d31339db4eed9315de3 |

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
- **HF_HOME bu makinede kullanıcının `/home/alper/gpu-server/hf-cache` dizinidir.** Freya ağırlıkları `~/videogen-data/models` altında DEĞİL, bu önbellekte durur (Chatterbox ağırlıkları `~/videogen-data/models/chatterbox`).
- Kullanılan HF anlık görüntüleri (`$HF_HOME/hub/models--*/snapshots/<hash>`):
  - `freyavoice/freya-tts` @ `d124e07493615208f58bdd21d432736849ee4230` (config.json, model.safetensors)
  - `openbmb/VoxCPM2` @ `32279effe8c19989596f05d353d1447f51d9e915` (yalnızca `audiovae.pth`, Freya VAE'si)
  - `mobiuslabsgmbh/faster-whisper-large-v3-turbo` @ `0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf` (ASR)
- Freya venv: `~/videogen-data/venvs/freya` (torch==2.6.0, voxcpm==2.0.3 --no-deps, FreyaTTS kaynağı `~/videogen-data/src/FreyaTTS` @ 146d36c, `.pth` ile).
