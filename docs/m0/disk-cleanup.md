# M0 Disk temizliği

## Önce (2026-10-06T04:00:06+03:00)
```
/dev/nvme0n1p5  141G  126G  8.1G  94% /
NAME             ID              SIZE      MODIFIED     
gemma4:e2b       7fbdbf8f5e45    7.2 GB    2 months ago    
gemma4:e4b       c6eb396dbd59    9.6 GB    2 months ago    
qwen3.5:4b       2a654d98e6fb    3.4 GB    2 months ago    
bge-m3:latest    790764642607    1.2 GB    2 months ago    
qwen3:4b         359d7dd4bcda    2.5 GB    2 months ago    
1.8G	~/.npm
695M	~/.cache/go-build
1.1G	~/.cache/google-chrome
762M	~/.cache/uv
718M	~/gpu-server/jet-engine/node_modules
635M	~/gpu-server/remotion-test/node_modules
8.7G	~/gpu-server/minillm-lab
```

Not: Chrome açıktı → `~/.cache/google-chrome` atlandı. minillm-lab kapı kontrolü temiz (status/unpushed/stash boş; HEAD = origin/main eae3905; yok sayılanlar yalnızca .venv'ler).

## Sonra (2026-10-06T04:00:30+03:00)
```
/dev/nvme0n1p5  141G  102G   32G  77% /
NAME             ID              SIZE      MODIFIED     
qwen3.5:4b       2a654d98e6fb    3.4 GB    2 months ago    
bge-m3:latest    790764642607    1.2 GB    2 months ago    
qwen3:4b         359d7dd4bcda    2.5 GB    2 months ago    
```
