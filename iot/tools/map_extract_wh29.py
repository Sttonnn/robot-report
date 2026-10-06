import json
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as nd
a = np.asarray(Image.open('wh29_0.png').convert('RGB')).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
reg = np.zeros(r.shape, bool); reg[275:1186, 163:1660] = True
masks = {'rack': (g > 150) & (r < 120) & (b < 120), 'shelf': (g > 150) & (b > 150) & (r < 120), 'flow': (r > 180) & (g > 180) & (b < 120)}
boxes = []
for t, m in masks.items():
    m = m & reg
    close = (5, 5) if t == 'rack' else (15, 11)
    mm = nd.binary_fill_holes(nd.binary_closing(m, structure=np.ones(close)))
    lab, n = nd.label(mm)
    for sl in nd.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        w, h = x1 - x0, y1 - y0
        if t == 'rack' and w * h < 250: continue
        if t != 'rack' and (h < 150 or w > 45): continue
        boxes.append([int(x0), int(y0), int(w), int(h), t])
print(len(boxes), {t: sum(1 for x in boxes if x[4] == t) for t in masks})
json.dump(boxes, open('boxes_29.json', 'w'))
im = Image.open('wh29_0.png').convert('RGB'); d = ImageDraw.Draw(im)
for x, y, w, h, t in boxes: d.rectangle([x, y, x + w, y + h], outline=(255, 0, 255), width=2)
im.save('check_29.png')
