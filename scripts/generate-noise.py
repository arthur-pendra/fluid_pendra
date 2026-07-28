"""Genereert public/noise-fractal.png: naadloos herhaalbare fractale RGB-ruis.

De advectiepass leunt hierop. Per kanaal een eigen fbm:
  R  drempelwaarde, bepaalt waar de stroming inzakt
  GB richting, gelezen als (rg - 0.5) * 2

Herhaalbaarheid is een harde eis: de textuur wordt met wrap gelezen op twee
schalen tegelijk, dus een naad zou als een lijn in de vloeistof verschijnen.
Daarom wordt de waarde-ruis op een torus gegenereerd.

Gebruik:  python scripts/generate-noise.py
"""
import zlib
import struct
import numpy as np

SIZE = 512
OCTAVES = 5
SEED = 20260727


def value_noise(size, period, rng):
    """Waarde-ruis die naadloos herhaalt: het roostervlak wordt cyclisch."""
    grid = rng.random((period, period)).astype(np.float32)

    # bilineair opschalen met wrap-around
    coords = np.linspace(0, period, size, endpoint=False, dtype=np.float32)
    i0 = np.floor(coords).astype(np.int32) % period
    i1 = (i0 + 1) % period
    frac = coords - np.floor(coords)
    # smoothstep, zoals gebruikelijk bij waarde-ruis
    frac = frac * frac * (3.0 - 2.0 * frac)

    a = grid[np.ix_(i0, i0)]
    b = grid[np.ix_(i1, i0)]
    c = grid[np.ix_(i0, i1)]
    d = grid[np.ix_(i1, i1)]

    fx = frac[:, None]
    fy = frac[None, :]
    top = a + (b - a) * fx
    bottom = c + (d - c) * fx
    return top + (bottom - top) * fy


def fbm(size, rng):
    total = np.zeros((size, size), dtype=np.float32)
    amplitude = 1.0
    period = 4
    weight = 0.0
    for _ in range(OCTAVES):
        total += value_noise(size, period, rng) * amplitude
        weight += amplitude
        amplitude *= 0.5
        period *= 2
    result = total / weight
    # uitrekken naar de volle 0 tot 1, anders blijft alles rond het midden hangen
    return (result - result.min()) / max(result.max() - result.min(), 1e-6)


def write_png(path, pixels):
    height, width, _ = pixels.shape
    raw = b''.join(
        b'\x00' + pixels[y].tobytes() for y in range(height)
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    open(path, 'wb').write(png)


rng = np.random.default_rng(SEED)
channels = [fbm(SIZE, rng) for _ in range(3)]
pixels = (np.stack(channels, axis=-1) * 255).astype(np.uint8)
write_png('public/noise-fractal.png', pixels)
print(f'public/noise-fractal.png geschreven: {SIZE}x{SIZE}, {OCTAVES} octaven')
