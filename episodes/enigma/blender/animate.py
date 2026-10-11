"""Animasyon. Tüm vuruşlar seslendirmenin kelime karelerine bağlı (common.word / clip)."""
import math

import bpy
from mathutils import Vector

import rotors as R
from build import STACK
from common import B, FRAMES, clip, hide_keys, interp, key, key_input, word

# ---------------------------------------------------------------- zaman çizelgesi (Remotion karesi)
T = dict(
    HOOK_PRESS=[16, word("s02", "zaaf") - 4],
    EXPLODE=(word("s05", "var") - 6, word("s05", "var") + 40),
    PRESS_IN=word("s06", "basınca"),               # sinyal yolu başlar
    LAMP=word("s07", "lambayı"),
    DIVE=(clip("s07")[1] + 4, word("s08", "rotor")),
    SPREAD=(word("s08", "rotor") - 4, word("s08", "adım")),
    PRESSES=[word("s08", "adım") + 2, word("s08", "harf") + 2, word("s08", "çıkar") + 2],
    AHA=(word("s09", "Ama"), clip("s10")[1]),
    ZAAF=word("s10", "zaaf"),
    SOLVE_IN=(clip("s10")[1] + 2, clip("s10")[1] + 40),
    BOMBE=(word("s13", "gerisini"), clip("s13")[1] + 8),
    CLOSE=(clip("s13")[1] + 10, clip("s13")[1] + 40),
    CTA=(clip("s15")[0], FRAMES - 1),
    END=FRAMES - 1,
)
T["TYPE0"] = word("s03", "mesajlarını") - 8
T["TYPE_STEP"] = 9
T["RESET0"] = T["EXPLODE"][0] - 2          # kanca basışlarından sonra rotorlar görünmezken sıfırlanır

# katman ötelemeleri (cm) ve dalga gecikmeleri (kare)
EXPL = {"Kasa": ((0, 0, -6), 0), "Priz": ((-8, 0, -2), 2), "Taban": ((0, 0, 0), 0), "Tuslar": ((-2, 0, 3), 4),
        "Lambalar": ((0, 0, 7), 8), "Ust": ((2, 0, 13), 12), "Rotorlar": ((0, 0, 22), 16)}
SOLVE = {"Ust": (6, 0, 42)}                 # çözümde rotorlar yerinde görünsün diye yalnız üst plaka kalkık
SPREAD_K = 1.9                              # dalışta eksen boyunca açılma

EVENTS = []                                 # (kare, giriş, konum_önce) → encipher sonuçları


def press_key(P, f, ch="A"):
    piv = P["keys"][ch]
    key(piv, B(f - 2), loc=(piv.location.x, piv.location.y, 0))
    key(piv, B(f + 1), loc=(piv.location.x, piv.location.y, -0.55))
    key(piv, B(f + 6), loc=(piv.location.x, piv.location.y, 0))


def rot_angle(p):
    return -2 * math.pi * p / 26


def animate(P, M, scene):
    interp("BEZIER")
    lay, grp, rot = P["lay"], P["grp"], P["rot"]

    # --- kanca: A tuşu iki kez (B, D yanar), sonra rotorlar gizlice sıfırlanır
    pos = [0, 0, 0]
    seq = []
    for f in T["HOOK_PRESS"]:
        seq.append((f, pos[:]))
        c, pos, path = R.encipher("A", pos)
        EVENTS.append(dict(f=f, key="A", out=c, pos=pos[:], path=path, kind="hook"))
    for n, ch in enumerate("ENIGMA"):              # s03: "mesajlarını Enigma ile şifreliyordu" → gerçekten yazılır
        f = T["TYPE0"] + n * T["TYPE_STEP"]
        c, pos, path = R.encipher(ch, pos)
        EVENTS.append(dict(f=f, key=ch, out=c, pos=pos[:], path=path, kind="hook"))
    pos = [0, 0, 0]
    for f in [T["PRESS_IN"]] + T["PRESSES"]:
        c, pos, path = R.encipher("A", pos)
        EVENTS.append(dict(f=f, key="A", out=c, pos=pos[:], path=path, kind="main"))
    for ev in EVENTS:
        press_key(P, ev["f"], ev["key"])

    # rotor açıları: her basışta (f−1 → f+3) bir adım; sıfırlama RESET0'da sabit atlama
    interp("LINEAR")
    names = ["R0", "R1", "R2"]
    MAIN0 = next(e for e in EVENTS if e["kind"] == "main")
    state = [0, 0, 0]
    for i, n in enumerate(names):
        key(rot[n], 1, rot=(0, 0, 0))
    for ev in EVENTS:
        f = ev["f"]
        if ev is MAIN0:
            PRE_RESET = state[:]
            for i, n in enumerate(names):          # sıfırlama (rotorlar kapağın altında, görünmez)
                key(rot[n], B(T["RESET0"]), rot=(0, 0, rot_angle(state[i])))
                key(rot[n], B(T["RESET0"]) + 1, rot=(0, 0, 0))
            state = [0, 0, 0]
        for i, n in enumerate(names):
            if ev["pos"][i] != state[i]:
                key(rot[n], B(f - 1), rot=(0, 0, rot_angle(state[i])))
                key(rot[n], B(f + 3), rot=(0, 0, rot_angle(ev["pos"][i])))
        state = ev["pos"][:]
    # kriz (s04): "ayarlar her gün değişiyordu" → rotorlar kapağın altında tam turlar döner (konum değişmez)
    k0 = word("s04", "Ayarlar")
    for n, turns in (("R2", 2), ("R1", 1), ("R0", 1)):
        i = names.index(n)
        key(rot[n], B(k0), rot=(0, 0, rot_angle(PRE_RESET[i])))
        key(rot[n], B(T["RESET0"] - 2), rot=(0, 0, rot_angle(PRE_RESET[i]) - 2 * math.pi * turns))
    # Bombe taraması: rotorlar hızla döner (orta ve sol daha yavaş), sonra sıfıra döner (döngü)
    b0, b1 = T["BOMBE"]
    speeds = {"R2": 3.1, "R1": 1.3, "R0": 0.55}           # tur / sn
    for i, n in enumerate(names):
        a0 = rot_angle(state[i])
        key(rot[n], B(b0), rot=(0, 0, a0))
        turns = round(speeds[n] * (b1 - b0) / 30)
        key(rot[n], B(b1), rot=(0, 0, -2 * math.pi * max(1, turns)))
        key(rot[n], FRAMES, rot=(0, 0, -2 * math.pi * max(1, turns)))
    interp("BEZIER")

    # --- lambalar: her olayda çıkış harfi yanar (kanca: hemen; ana olay: sinyal LAMP'a varınca)
    for ev in EVENTS:
        ch = ev["out"]
        mat = P["bulbs"][ch].data.materials[0]
        on = ev["f"] + 3 if ev is not MAIN0 else T["LAMP"] + 6
        off = on + (34 if ev["key"] == "A" and ev["kind"] == "hook" else 7 if ev["kind"] == "hook" else 26)
        if ev is MAIN0:
            off = T["DIVE"][0] - 2
        ev["lamp_on"], ev["lamp_off"] = on, off
        key_input(mat, "Emission Strength", [(B(on) - 2, 0.0), (B(on), 9.0), (B(off) - 4, 9.0), (B(off), 0.0)])

    # --- katmanlar: patlatma → dalışta çekilme → çözümde üst plaka kalkık → kapanış
    e0, e1 = T["EXPLODE"]
    d0, d1 = T["DIVE"]
    s0, s1 = T["SOLVE_IN"]
    c0, c1 = T["CLOSE"]
    for g, (off, dl) in EXPL.items():
        o = lay[g]
        off = Vector(off)
        key(o, 1, loc=(0, 0, 0))
        key(o, B(e0 + dl), loc=(0, 0, 0))
        key(o, B(e0 + dl + 24), loc=off)
        if g != "Rotorlar":
            away = off + Vector((0, 0, -40 if g in ("Kasa", "Priz", "Taban", "Tuslar") else 90))
            key(o, B(d0 - 2 + dl // 3), loc=off)
            key(o, B(d0 + 20 + dl // 3), loc=away)
            key(o, B(s0 - 4), loc=away)
        else:
            key(o, B(s0 - 4), loc=off)
        sol = Vector(SOLVE.get(g, (0, 0, 0)))
        key(o, B(s1 - 8 + dl // 2), loc=sol)
        key(o, B(c0), loc=sol)
        key(o, B(c1), loc=(0, 0, 0))
        key(o, FRAMES, loc=(0, 0, 0))

    # --- rotor grubu: dalışta eksen dikleşir (ETW altta, UKW üstte), açılır; çözümde yerine döner
    g0 = grp.location.copy()
    key(grp, 1, loc=g0, rot=(-math.pi / 2, 0, 0))
    key(grp, B(d0), loc=g0, rot=(-math.pi / 2, 0, 0))
    key(grp, B(d1), loc=g0 + Vector((0, 0, 3.0)), rot=(0, 0, math.radians(-30)))
    key(grp, B(s0), loc=g0 + Vector((0, 0, 3.0)), rot=(0, 0, math.radians(-30)))
    key(grp, B(s1), loc=g0, rot=(-math.pi / 2, 0, 0))
    key(grp, FRAMES, loc=g0, rot=(-math.pi / 2, 0, 0))
    a0, a1 = T["SPREAD"]
    for k, z in STACK.items():
        sl = P[f"slot_{k}"]
        key(sl, 1, loc=(0, 0, z))
        key(sl, B(a0), loc=(0, 0, z))
        key(sl, B(a1), loc=(0, 0, z * SPREAD_K + 1.0))
        key(sl, B(s0), loc=(0, 0, z * SPREAD_K + 1.0))
        key(sl, B(s0 + 22), loc=(0, 0, z))
        key(sl, FRAMES, loc=(0, 0, z))

    # --- X-ray: rotor gövdeleri dalışta saydam, reflektör aha'da parlar
    key_input(M["bakeliteH"], "Alpha", [(1, 1.0), (B(a0), 1.0), (B(a1), 0.16), (B(s0), 0.16), (B(s0 + 16), 1.0)])
    h0, h1 = T["AHA"]
    key_input(M["ukw"], "Emission Strength", [(1, 0.0), (B(h0), 0.0), (B(h0 + 10), 1.6), (B(h1), 1.6),
                                               (B(h1 + 12), 0.0)])
    # kanal baskısı: CTA'da parlar, son karede söner (döngü)
    k0, _ = T["CTA"]
    key_input(M["print"], "Emission Strength", [(1, 0.0), (B(k0), 0.0), (B(k0 + 10), 1.4), (B(T["END"] - 14), 1.4),
                                                 (B(T["END"]), 0.0)])
    return T


def signal_wires(P, M):
    """Ana olaylarda sinyalin geçtiği telleri parlat (yerel indisler encipher yolundan)."""
    windows = []
    main = [e for e in EVENTS if e["kind"] == "main"]
    for n, ev in enumerate(main):
        f0 = T["PRESS_IN"] + 4 if n == 0 else ev["f"] + 3
        f1 = (main[n + 1]["f"] + 2) if n + 1 < len(main) else T["AHA"][1] + 6
        p = ev["path"]
        for i in (2, 1, 0):
            for d in ("fwd", "back"):
                a, b = p[f"r{i}_{d}"]
                idx = a if d == "fwd" else b              # tel indisi = sağ yüz pimi
                o = R.highlight_wire(f"Rotor{i}", idx, M, f"Sinyal_{n}_r{i}_{d}")
                hide_keys(o, [(0, True), (f0, False), (f1, True)])
        u = min(p["ukw_in"], p["ukw_out"])
        o = R.highlight_wire("UKW", u, M, f"Sinyal_{n}_ukw")
        hide_keys(o, [(0, True), (f0, False), (f1, True)])
        windows.append((f0, f1))
    return windows
