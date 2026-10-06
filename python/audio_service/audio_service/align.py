"""Map ASR word timings back onto the script's own spelling. Each script word is
expanded to its spoken form (normalize_tr); spoken tokens are matched to ASR
tokens with difflib; script words get the span of their matched spoken tokens.
Unmatched words are interpolated between neighbours so output stays complete
and monotonic."""
from difflib import SequenceMatcher

from .metrics import tr_lower
from .normalize_tr import UNITS, normalize_tr


def _norm(tok: str) -> str:
    return "".join(ch for ch in tr_lower(tok) if ch.isalnum())


def _spoken(word: str) -> list[str]:
    """Normalized spoken tokens of one script/ASR word. A bare unit ("mm") is read as its
    unit name; digits are spelled by normalize_tr."""
    text = normalize_tr(word)
    if text == word and word in UNITS:
        text = UNITS[word]
    return [t for t in (_norm(x) for x in text.split()) if t]


_MIN_MS = 10


def _spread(words: list[str], lo: int, hi: int) -> list[tuple[int, int]]:
    """Split [lo, hi] over a run of unmatched words proportionally to length (each at
    least _MIN_MS when the gap allows), contiguous and non-overlapping."""
    n = len(words)
    gap = max(0, hi - lo)
    floor = min(_MIN_MS, gap // n)
    weights = [max(len(_norm(w)), 1) for w in words]
    extra = gap - floor * n
    bounds, acc, edge = [], 0, lo
    for w in weights:
        acc += w
        nxt = lo + floor * (len(bounds) + 1) + round(extra * acc / sum(weights))
        bounds.append((edge, nxt))
        edge = nxt
    return bounds


def map_words(script: str, asr_words: list[dict]) -> list[dict]:
    script_words = script.split()
    spoken: list[tuple[int, str]] = []
    for idx, w in enumerate(script_words):
        for tok in _spoken(w):
            spoken.append((idx, tok))
    # ASR tokens (Whisper often writes digits) are expanded to spoken sub-tokens that share
    # the original token's [start, end] evenly.
    asr_tok: list[tuple[str, float, float]] = []
    for a in asr_words:
        subs = _spoken(a["text"])
        for k, tok in enumerate(subs):
            step = (a["end"] - a["start"]) / len(subs)
            asr_tok.append((tok, a["start"] + k * step, a["start"] + (k + 1) * step))
    sm = SequenceMatcher(a=[s for _, s in spoken], b=[t for t, _, _ in asr_tok], autojunk=False)
    spans: dict[int, list[float]] = {}
    for block in sm.get_matching_blocks():
        for k in range(block.size):
            widx = spoken[block.a + k][0]
            _, st, en = asr_tok[block.b + k]
            lo, hi = spans.get(widx, [st, en])
            spans[widx] = [min(lo, st), max(hi, en)]
    out: list[dict | None] = [None] * len(script_words)
    for idx, (st, en) in spans.items():
        out[idx] = {"text": script_words[idx], "startMs": round(st * 1000), "endMs": round(en * 1000)}
    idx = 0
    while idx < len(script_words):
        if out[idx] is not None:
            idx += 1
            continue
        end_run = idx
        while end_run < len(script_words) and out[end_run] is None:
            end_run += 1
        lo = out[idx - 1]["endMs"] if idx else 0
        if end_run < len(script_words):
            hi = out[end_run]["startMs"]
        else:
            hi = round(asr_words[-1]["end"] * 1000) if asr_words else lo
        run = script_words[idx:end_run]
        for w, (s0, e0) in zip(run, _spread(run, lo, max(lo, hi))):
            out[idx] = {"text": w, "startMs": s0, "endMs": e0}
            idx += 1
    return out  # type: ignore[return-value]


def transcribe_words(wav_path: str, model_size: str = "large-v3-turbo") -> list[dict]:
    import torch
    from faster_whisper import WhisperModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = WhisperModel(model_size, device=device, compute_type="int8_float16" if device == "cuda" else "int8")
    segments, _ = model.transcribe(wav_path, language="tr", word_timestamps=True, vad_filter=False)
    words = [{"text": w.word.strip(), "start": w.start, "end": w.end} for s in segments for w in (s.words or [])]
    del model
    if device == "cuda":
        torch.cuda.empty_cache()
    return words
