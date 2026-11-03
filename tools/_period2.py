# 用自相关测「地块平铺周期」：两张图都按各自宽度归一化后比较
from PIL import Image

def profile(path, box, step=2):
    im = Image.open(path).convert('L').crop(box)
    w, h = im.size
    px = list(im.getdata())
    prof = []
    for x in range(w):
        s = 0; n = 0
        for y in range(0, h, step):
            s += px[y*w + x]; n += 1
        prof.append(s/n)
    return prof

def autocorr(p):
    n = len(p); m = sum(p)/n
    q = [v-m for v in p]
    var = sum(v*v for v in q) or 1
    return [sum(q[i]*q[i+lag] for i in range(n-lag))/var for lag in range(n//2)]

def peaks(ac, lo=12, thr=0.12):
    out = []
    for lag in range(lo, len(ac)-1):
        if ac[lag] > ac[lag-1] and ac[lag] >= ac[lag+1] and ac[lag] > thr:
            out.append((lag, round(ac[lag], 3)))
    return out[:6]

cases = [
    ('ref menu', 'C:/Users/123/Desktop/e7a80f0e87189b5fe01ffaa8c33f07bf.png', (0, 40, 1080, 600), 1080),
]
for path, box, wnorm in cases:
    p = profile(path, box)
    print(path, 'peaks', peaks(autocorr(p)), 'norm_w', wnorm)
