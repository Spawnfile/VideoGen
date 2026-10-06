import re

_TR_LOWER = str.maketrans({"I": "ı", "İ": "i"})


def tr_lower(s: str) -> str:
    return s.translate(_TR_LOWER).lower()


def _clean(s: str) -> str:
    # Kesme işareti kelimeyi birleştirir (İstanbul'da -> istanbulda); diğer noktalama BOŞLUĞA
    # çevrilir, sonra boşluklar tekilleştirilir ("a — b", "a,b" yanlış hata sayılmaz).
    s = re.sub(r"['’ʼ]", "", tr_lower(s))
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]+", " ", s)).strip()


def cer(reference: str, hypothesis: str) -> float:
    ref, hyp = _clean(reference), _clean(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    prev = list(range(len(hyp) + 1))
    for i, rc in enumerate(ref, 1):
        cur = [i]
        for j, hc in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(ref)
