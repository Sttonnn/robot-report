import sys, json
from PIL import Image
import numpy as np
from scipy import ndimage as nd
a = np.asarray(Image.open('wh.png').convert('RGB')).astype(int)
dark = a.sum(2) < 380
YA, YB = 378, 1045            # แถบชั้นวาง
XA, XB = 300, 2345
prof = dark[YA:YB, :].sum(0)
line = prof > (YB - YA) * 0.25
line[:XA] = False; line[XB:] = False
# รวมเส้นที่ห่างกัน < 14px เป็น 1 แถวชั้นวาง
xs = np.where(line)[0]
rows = []
for x in xs:
    if rows and x - rows[-1][1] <= 14: rows[-1][1] = x
    else: rows.append([x, x])
rows = [r for r in rows if r[1] - r[0] >= 8]
boxes = []
for x0, x1 in rows:
    col = dark[YA:YB, x0:x1 + 1].any(1)
    col = nd.binary_closing(col, structure=np.ones(40))
    lab, n = nd.label(col)
    for sl in nd.find_objects(lab):
        y0, y1 = sl[0].start + YA, sl[0].stop + YA
        if y1 - y0 > 60: boxes.append([int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0), 'rack'])
# โซนซ้ายบน (ชั้นวางเล็ก + พื้นที่วางพาเลท)
reg = np.zeros_like(dark); reg[380:1045, 88:300] = True
m = nd.binary_fill_holes(nd.binary_closing(dark & reg, structure=np.ones((25, 7))))
lab, n = nd.label(m)
for i, sl in enumerate(nd.find_objects(lab)):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    if (y1 - y0) * (x1 - x0) < 1500: continue
    boxes.append([int(x0), int(y0), int(x1 - x0), int(y1 - y0), 'pallet' if (x1 - x0) > 150 else 'rack'])
print(len(rows), len(boxes), file=sys.stderr)
json.dump(boxes, open('boxes_wha.json', 'w'))
# ภาพตรวจ
from PIL import ImageDraw
im = Image.open('wh.png').convert('RGB'); d = ImageDraw.Draw(im)
for x, y, w, h, t in boxes: d.rectangle([x, y, x + w, y + h], outline=(255, 0, 0) if t == 'rack' else (0, 0, 255), width=2)
im.crop((60, 340, 2420, 1440)).save('check_wha.png')
