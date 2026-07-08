#!/usr/bin/env python3
"""Generate simple placeholder PNG icons (dark card with two caption bars)."""
import os
import struct
import zlib


def make(size, path):
    bg = (31, 42, 68, 255)      # #1f2a44
    bar = (138, 180, 248, 255)  # #8ab4f8
    m = max(1, size // 6)
    bh = max(1, size // 8)
    gap = max(1, size // 10)
    y1 = size // 2 - bh - gap // 2
    y2 = size // 2 + gap // 2
    short_right = (size - 2 * m) // 3  # second bar is shorter

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # PNG filter type 0 for the scanline
        for x in range(size):
            c = bg
            if y1 <= y < y1 + bh and m <= x < size - m:
                c = bar
            elif y2 <= y < y2 + bh and m <= x < size - m - short_right:
                c = bar
            raw += bytes(c)

    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data
                + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, 'icons')
    os.makedirs(out, exist_ok=True)
    for s in (16, 48, 128):
        make(s, os.path.join(out, f'icon{s}.png'))
    print('icons written to', out)
