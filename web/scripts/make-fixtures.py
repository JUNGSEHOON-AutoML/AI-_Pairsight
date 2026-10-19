"""Draws the mock fixture images. No photos from anywhere else: every pixel is drawn here.

public/fixtures/inputs/<scenario>.png     the image a tester uploads
public/fixtures/originals/<scenario>.png  the "earlier copy" the mock reverse search returns

Run: npm run fixtures   (needs Pillow)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "fixtures")
W, H = 800, 600


def scene(sky, ground, sign_text, sign_color, person=False, label="", extra=None):
    im = Image.new("RGB", (W, H), sky)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 400, W, H], fill=ground)
    d.rectangle([60, 160, 300, 400], fill=(201, 183, 156))
    d.rectangle([460, 100, 740, 400], fill=(183, 165, 138))
    d.rectangle([120, 240, 180, 320], fill=(92, 127, 163))
    d.rectangle([540, 260, 600, 340], fill=(92, 127, 163))
    d.rectangle([500, 90, 700, 202], fill=sign_color)
    d.text((560, 136), sign_text, fill=(255, 255, 255), font_size=40)
    if person:
        d.ellipse([152, 368, 208, 424], fill=(59, 47, 42))
        d.rounded_rectangle([150, 420, 210, 520], radius=12, fill=(122, 46, 46))
    if extra:
        extra(d)
    d.rectangle([16, 16, 16 + 12 * len(label) + 24, 52], fill=(28, 23, 32))
    d.text((28, 22), label, fill=(255, 255, 255), font_size=22)
    return im


def sun(d):
    d.ellipse([660, 30, 740, 110], fill=(242, 201, 76))


def save(im, kind, name):
    path = os.path.join(OUT, kind)
    os.makedirs(path, exist_ok=True)
    im.save(os.path.join(path, f"{name}.png"), optimize=False)


sky, ground = (159, 184, 207), (109, 106, 102)

# 진짜 확인: the upload is the same picture as the earlier copy.
base = scene(sky, ground, "CAFE", (47, 74, 107), label="SAMPLE authentic")
save(base, "inputs", "authentic")
save(base, "originals", "authentic")

# 편집 조작: sign text changed and a person added compared to the original.
save(scene(sky, ground, "CAFE", (47, 74, 107), label="SAMPLE edited"), "originals", "edited")
save(scene(sky, ground, "SALE", (47, 74, 107), person=True, label="SAMPLE edited"), "inputs", "edited")

# 맥락 조작: identical to an old copy (snowy palette = "taken in winter years ago").
old = scene((214, 222, 230), (236, 238, 240), "MARKET", (122, 46, 46), label="SAMPLE context")
save(old, "inputs", "miscontextualized")
save(old, "originals", "miscontextualized")

# AI 생성: no earlier copy; C2PA says an AI tool made it. Its own composition (not the street template), so no
# other fixture can pass as its "original": a ringed planet over a pink dune sea with floating lanterns.
def dreamscape():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):  # violet sky into a pink horizon, then dunes
        t = y / (H - 1)
        if y < 360:
            c = (int(40 + 190 * t), int(20 + 60 * t), int(90 + 80 * t))
        else:
            c = (int(236 - 60 * (t - .6)), int(150 - 70 * (t - .6)), int(120 - 40 * (t - .6)))
        d.line([0, y, W, y], fill=c)
    d.ellipse([90, 60, 330, 300], fill=(250, 196, 120))  # planet, upper left
    d.ellipse([50, 165, 370, 205], outline=(255, 236, 200), width=6)  # ring
    d.ellipse([150, 120, 210, 150], fill=(230, 160, 100))
    for i, x in enumerate(range(-100, W + 200, 180)):  # dune crests
        d.pieslice([x, 330 + (i % 2) * 40, x + 360, 560 + (i % 2) * 40], 180, 360, fill=(200 - i * 6, 110 - i * 4, 120))
    for x, y, r in [(520, 120, 34), (640, 210, 26), (450, 250, 20), (720, 90, 18), (590, 320, 14)]:  # lanterns
        d.ellipse([x - r - 10, y - r - 10, x + r + 10, y + r + 10], fill=(255, 220, 160))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 140, 60))
        d.line([x, y + r, x, y + r + 30], fill=(120, 60, 40), width=3)
    d.rectangle([16, 16, 16 + 12 * len("SAMPLE ai") + 24, 52], fill=(28, 23, 32))
    d.text((28, 22), "SAMPLE ai", fill=(255, 255, 255), font_size=22)
    return im


save(dreamscape(), "inputs", "ai_generated")

# 판단 불가: only a loosely similar picture exists, no date, no provenance.
save(scene((170, 196, 170), (96, 110, 90), "PARK", (40, 90, 60), label="SAMPLE inconclusive"), "inputs", "inconclusive")
save(scene((150, 176, 150), (86, 100, 80), "PARK", (40, 90, 60), extra=sun, label="similar photo"), "originals", "inconclusive")

# 원본 없음: nothing anywhere.
save(scene((220, 200, 180), (120, 100, 90), "HOME", (90, 60, 40), label="SAMPLE no-source"), "inputs", "no_source")

# 분석 실패: the mock provider times out on this one.
save(scene((60, 60, 70), (40, 40, 45), "ERROR", (120, 20, 20), label="SAMPLE provider-timeout"), "inputs", "provider_timeout")

print("fixtures written to", os.path.normpath(OUT))
