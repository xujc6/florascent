# 纯 Python 版：测量地面纹理的水平周期（自相关），用来对齐「地块 : 花朵」比例
from PIL import Image
import sys

def profile(path, box):
    im = Image.open(path).convert('L').crop(box)
    w, h = im.size
    px = list(im.getdata())
    prof = []
    for x in range(w):
        s = 0
        for y in range(0, h, 2):
            s += px[y*w + x]
        prof.append(s / (h//2 + 1))
    return prof

def autocorr(p):
    n = len(p)
    m = sum(p)/n
    q = [v-m for v in p]
    var = sum(v*v for v in q) or 1
    out = []
    for lag in range(0, n//2):
        s = 0.0
        for i in range(n-lag):
            s += q[i]*q[i+lag]
        out.append(s/var)
    return out

def first_peak(ac, lo=18):
    for lag in range(lo, len(ac)-1):
        if ac[lag] > ac[lag-1] and ac[lag] >= ac[lag+1] and ac[lag] > 0.22:
            return lag, round(ac[lag], 3)
    return None, None

if __name__ == '__main__':
    for path, box in [
        ('C:/Users/123/Desktop/原游戏截图.png', (1900, 380, 2500, 1500)),
        ('shots/m_desert.png', (300, 100, 900, 700)),
    ]:
        p = profile(path, box)
        ac = autocorr(p)
        lag, v = first_peak(ac)
        print(path, 'period =', lag, 'corr =', v, 'sample_w =', len(p))
