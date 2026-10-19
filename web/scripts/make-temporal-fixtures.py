"""Owned drawings of one street on two days. No remote photographs or image compositing.
Same buildings/camera; independent people, car, clouds, lighting and shadows.
Run from web/: python3 scripts/make-temporal-fixtures.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'tests/fixtures/temporal'
OUT.mkdir(parents=True, exist_ok=True)

def street(later=False):
    im = Image.new('RGB', (800, 600), (164, 186, 211) if later else (153, 184, 215))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 400, 800, 600), fill=(121, 119, 115) if later else (109, 106, 102))
    d.rectangle((60, 160, 300, 400), fill=(205, 185, 153) if later else (201, 183, 156))
    d.rectangle((460, 100, 740, 400), fill=(190, 169, 136) if later else (183, 165, 138))
    for x, y in [(120, 240), (540, 260)]:
        d.rectangle((x, y, x + 60, y + 80), fill=(92, 127, 163))
        d.line((x + 30, y, x + 30, y + 80), fill=(210, 210, 199), width=3)
    d.rectangle((500, 90, 700, 202), fill=(47, 74, 107))
    d.text((543, 130), 'CAFE', fill='white', font_size=40)
    # Clouds move independently, keeping the camera and buildings fixed.
    for x, y in ([(70, 45), (290, 70)] if later else [(250, 35), (30, 83)]):
        d.ellipse((x, y, x + 85, y + 25), fill=(224, 228, 229))
        d.ellipse((x + 22, y - 9, x + 60, y + 28), fill=(224, 228, 229))
    # Two pedestrians walk between the two exposures; shadows change with daylight.
    for x, y, color in ([(365, 360, (122, 46, 46)), (220, 485, (31, 71, 100))] if later else [(170, 370, (122, 46, 46)), (420, 490, (31, 71, 100))]):
        d.polygon([(x-5,y+80),(x+20,y+80),(x+65 if later else x-35,y+100),(x+35 if later else x-50,y+100)], fill=(88, 88, 86))
        d.ellipse((x, y, x+28, y+28), fill=(62, 48, 40))
        d.rounded_rectangle((x-4,y+28,x+32,y+78), radius=7, fill=color)
    # A passing car is at a different place on the road, not pasted onto a previous picture.
    x = 470 if later else 620
    d.rounded_rectangle((x,450,x+115,498), radius=7, fill=(209,179,66))
    d.rectangle((x+25,438,x+85,465), fill=(84,120,146))
    for wheel in (x+19, x+90): d.ellipse((wheel,487,wheel+18,505), fill=(35,36,39))
    return im

for name, later in [('street-morning', False), ('street-later', True)]:
    street(later).save(OUT / (name + '.png'))
print('Wrote independently drawn same-place/different-time fixtures to', OUT)
