"""Draws scene fixtures whose composition, colour and subject differ from each other and from the template
fixtures (make-fixtures.py). Every pixel is drawn here; no third-party images.

They exist to test the "same scene" gate: a candidate that shows a different scene must never become the
"original" an upload is compared against.

public/fixtures/scenes/<name>.png
  night_city, beach, forest, fruit_table, mountain_lake, aerial_fields  six unrelated scenes
  studio_teapot, studio_plant, studio_vase, studio_bicycle
      lookalikes: same studio backdrop, light and grain, different subject. The grey-level layout is so close
      that pixel alignment accepts several pairs with one "local" difference region, i.e. they look like an
      edited copy of each other although they are different photos.

Run: python3 scripts/make-scene-fixtures.py   (needs Pillow + numpy)
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "fixtures", "scenes")
W, H = 800, 600


def finish(im, seed, label, grain=6.0):
    """Light blur + sensor-like grain so scenes are not flat vector art; deterministic per seed."""
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    rng = np.random.default_rng(seed)
    a = np.asarray(im).astype(np.float32) + rng.normal(0, grain, (H, W, 1))
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.rectangle([W - 16 - 12 * len(label) - 24, H - 52, W - 16, H - 16], fill=(28, 23, 32))
    d.text((W - 12 * len(label) - 28, H - 46), label, fill=(255, 255, 255), font_size=22)
    return im


def vgrad(top, bottom, y0=0, y1=H):
    a = np.zeros((H, W, 3), np.float32)
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        a[y, :] = [top[i] * (1 - t) + bottom[i] * t for i in range(3)]
    return a


def night_city():
    a = vgrad((8, 12, 40), (40, 30, 80))
    im = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(1)
    for _ in range(120):
        x, y = rng.integers(0, W), rng.integers(0, 260)
        d.point((int(x), int(y)), fill=(255, 255, 230))
    d.ellipse([620, 50, 700, 130], fill=(250, 245, 210))
    x = 0
    while x < W:
        w, h = int(rng.integers(50, 120)), int(rng.integers(180, 420))
        d.rectangle([x, H - h, x + w, H], fill=(18, 18, 28))
        for wy in range(H - h + 14, H - 10, 22):
            for wx in range(x + 8, x + w - 10, 16):
                if rng.random() < 0.45:
                    d.rectangle([wx, wy, wx + 7, wy + 10], fill=(255, 210, 90))
        x += w + int(rng.integers(2, 14))
    return finish(im, 11, "SAMPLE night-city")


def beach():
    a = vgrad((90, 170, 235), (200, 230, 250), 0, 260)
    a[260:380] = vgrad((20, 110, 160), (60, 170, 190), 260, 380)[260:380]
    a[380:] = vgrad((236, 214, 160), (214, 188, 130), 380, H)[380:]
    im = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.ellipse([90, 40, 190, 140], fill=(255, 240, 150))
    for i in range(6):  # foam
        d.arc([i * 140 - 40, 360, i * 140 + 120, 400], 180, 360, fill=(250, 250, 250), width=4)
    d.line([560, 300, 560, 520], fill=(90, 70, 60), width=6)
    for k, c in enumerate([(220, 40, 40), (250, 250, 250)] * 3):
        d.pieslice([440, 240, 680, 380], 180 + k * 30, 210 + k * 30, fill=c)
    d.rectangle([300, 470, 420, 500], fill=(40, 120, 200))
    return finish(im, 12, "SAMPLE beach")


def forest():
    a = vgrad((170, 200, 150), (60, 90, 50))
    im = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(3)
    for _ in range(40):
        x, y, r = int(rng.integers(0, W)), int(rng.integers(0, 300)), int(rng.integers(40, 110))
        g = int(rng.integers(70, 140))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(30, g, 40))
    for x in [40, 150, 230, 380, 520, 610, 730]:
        w = int(rng.integers(26, 60))
        d.rectangle([x, 120, x + w, H], fill=(84, 58, 38))
    d.polygon([(330, H), (470, H), (420, 380), (380, 380)], fill=(170, 140, 100))
    return finish(im, 13, "SAMPLE forest")


def fruit_table():
    a = np.zeros((H, W, 3), np.float32)
    for y in range(H):  # wood planks with grain
        plank = (y // 75) % 2
        base = (150, 100, 60) if plank else (135, 88, 52)
        a[y, :] = [c + 10 * np.sin(y * 0.9 + plank) for c in base]
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.ellipse([170, 90, 630, 520], fill=(245, 245, 240))
    d.ellipse([200, 120, 600, 490], fill=(232, 232, 226))
    for (x, y, c) in [(330, 220, (240, 140, 20)), (440, 240, (230, 130, 15)), (380, 330, (200, 30, 40)),
                      (290, 330, (120, 180, 40)), (480, 350, (240, 200, 40))]:
        d.ellipse([x - 55, y - 55, x + 55, y + 55], fill=c)
        d.ellipse([x - 25, y - 35, x - 5, y - 15], fill=tuple(min(255, v + 60) for v in c))
    d.rectangle([660, 60, 760, 560], fill=(200, 60, 60))  # napkin
    return finish(im, 14, "SAMPLE fruit-table")


def mountain_lake():
    a = vgrad((120, 160, 220), (230, 220, 210), 0, 330)
    a[330:] = vgrad((40, 70, 110), (20, 40, 70), 330, H)[330:]
    im = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(im)
    peaks = [(-50, 330, 160, 90, 380), (180, 330, 420, 40, 660), (480, 330, 650, 120, 860)]
    for x0, y0, px, py, x1 in peaks:
        d.polygon([(x0, y0), (px, py), (x1, y0)], fill=(90, 90, 110))
        d.polygon([(px - 50, py + 70), (px, py), (px + 50, py + 70), (px + 10, py + 55)], fill=(245, 245, 250))
        d.polygon([(x0, y0), (px, 660 - py), (x1, y0)], fill=(60, 75, 105))  # reflection
    return finish(im, 15, "SAMPLE mountain-lake")


def aerial_fields():
    im = Image.new("RGB", (W, H), (110, 150, 70))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(6)
    for gx in range(0, W, 160):
        for gy in range(0, H, 150):
            c = [(150, 170, 60), (90, 130, 50), (190, 170, 90), (120, 160, 90)][int(rng.integers(0, 4))]
            d.rectangle([gx + 6, gy + 6, gx + 154, gy + 144], fill=c)
            for s in range(gy + 14, gy + 140, 12):
                d.line([gx + 10, s, gx + 150, s], fill=tuple(v - 18 for v in c), width=2)
    d.polygon([(0, 270), (W, 200), (W, 250), (0, 320)], fill=(80, 80, 85))
    d.rectangle([370, 0, 420, H], fill=(80, 80, 85))
    for x, y, c in [(120, 285, (220, 30, 30)), (600, 222, (30, 90, 220)), (385, 450, (240, 240, 240))]:
        d.rectangle([x, y, x + 26, y + 14], fill=c)
    return finish(im, 16, "SAMPLE aerial-fields")


def studio(subject, label):
    """Seamless studio backdrop: bright wall fading into a dark floor, one soft shadow. Same backdrop, light and
    grain for every studio fixture, so only the subject differs."""
    a = vgrad((246, 246, 242), (70, 70, 68))
    im = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.ellipse([250, 480, 550, 540], fill=(60, 60, 58))
    subject(d)
    return finish(im, 30, label, grain=4.0)


def teapot(d):
    c = (200, 60, 40)
    d.ellipse([310, 330, 490, 490], fill=c)
    d.rectangle([380, 300, 420, 335], fill=c)
    d.polygon([(480, 380), (560, 330), (565, 345), (490, 410)], fill=c)
    d.arc([270, 350, 340, 440], 90, 270, fill=c, width=14)


def plant(d):
    d.rectangle([350, 400, 450, 490], fill=(170, 90, 50))
    for i in range(7):
        d.ellipse([300 + i * 20, 300 + (i % 3) * 25, 360 + i * 20, 360 + (i % 3) * 25], fill=(40, 140, 60))


def vase(d):
    d.ellipse([330, 260, 470, 500], fill=(40, 70, 140))
    d.rectangle([370, 180, 430, 300], fill=(40, 70, 140))
    d.ellipse([360, 170, 440, 200], fill=(30, 55, 110))
    for i, c in enumerate([(230, 60, 90), (250, 190, 40), (240, 120, 160)]):
        d.ellipse([340 + i * 40, 110 + (i % 2) * 20, 390 + i * 40, 160 + (i % 2) * 20], fill=c)
        d.line([365 + i * 40, 160, 400, 190], fill=(40, 120, 50), width=4)


def bicycle(d):
    for cx in (300, 500):
        d.ellipse([cx - 90, 330, cx + 90, 510], outline=(30, 30, 30), width=10)
        d.ellipse([cx - 8, 412, cx + 8, 428], fill=(30, 30, 30))
    frame = (200, 40, 40)
    d.line([300, 420, 400, 420], fill=frame, width=10)
    d.line([400, 420, 470, 300], fill=frame, width=10)
    d.line([300, 420, 360, 300], fill=frame, width=10)
    d.line([360, 300, 470, 300], fill=frame, width=10)
    d.line([470, 300, 500, 420], fill=frame, width=10)
    d.line([360, 300, 350, 270], fill=(30, 30, 30), width=8)
    d.rectangle([325, 260, 380, 272], fill=(30, 30, 30))
    d.line([470, 300, 480, 250], fill=(30, 30, 30), width=8)
    d.line([460, 250, 510, 250], fill=(30, 30, 30), width=8)


SCENES = {
    "night_city": night_city, "beach": beach, "forest": forest, "fruit_table": fruit_table,
    "mountain_lake": mountain_lake, "aerial_fields": aerial_fields,
    "studio_teapot": lambda: studio(teapot, "SAMPLE studio-teapot"),
    "studio_plant": lambda: studio(plant, "SAMPLE studio-plant"),
    "studio_vase": lambda: studio(vase, "SAMPLE studio-vase"),
    "studio_bicycle": lambda: studio(bicycle, "SAMPLE studio-bicycle"),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, make in SCENES.items():
        make().save(os.path.join(OUT, f"{name}.png"), optimize=False)
    print("scene fixtures written to", os.path.normpath(OUT))
