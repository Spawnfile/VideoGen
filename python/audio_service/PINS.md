# Sabitlenmiş bağımlılıklar

Ses servisi yalnızca YAKLASIM müzik yatağını üretir (`audio_service.yaklasim_cli`, spec Y14). Spec Z1 ile seslendirme (TTS, Whisper ASR,
hizalama) kaldırıldı; torch, chatterbox, Freya ve faster-whisper artık gerekmez.

`requirements.freeze.txt` bütün bağımlılıkları sabitler (numpy, soundfile ve test için pytest). Kendi paketimiz (editable) dosyada yoktur.

```bash
cd python/audio_service
uv venv .venv -p 3.12
uv pip install --python .venv -r requirements.freeze.txt
uv pip install --python .venv --no-deps -e .
```

Var olan bir venv'de eski TTS paketleri kurulu kalabilir; zararsızdır, yeniden kurulum gerekmez.
