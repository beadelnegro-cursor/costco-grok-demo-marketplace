#!/usr/bin/env python3
"""Recreate a Costco-style red C mark (attachment was not on disk)."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

SIZE = 512
RED = (227, 24, 55, 255)  # #E31837
WHITE = (255, 255, 255, 255)
BG = WHITE


def png_rgba(width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row = y * width
        for x in range(width):
            raw.extend(pixels[row + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", ihdr),
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            chunk(b"IEND", b""),
        ]
    )


def mix(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
    t: float,
) -> tuple[int, int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))  # type: ignore[return-value]


def coverage(signed_dist: float, aa: float = 1.15) -> float:
    """1 inside (negative dist), 0 outside, smoothed across ~aa pixels."""
    return max(0.0, min(1.0, 0.5 - signed_dist / (2.0 * aa)))


def generate() -> bytes:
    cx = cy = (SIZE - 1) / 2.0
    outer_r = 196.0
    inner_r = 92.0
    # Opening faces right; terminals sit near ±52deg from +x.
    half_gap = math.radians(50.0)
    terminal_r = (outer_r - inner_r) / 2.0
    mid_r = (outer_r + inner_r) / 2.0

    pixels: list[tuple[int, int, int, int]] = []
    for y in range(SIZE):
        for x in range(SIZE):
            dx = x - cx
            dy = y - cy
            r = math.hypot(dx, dy)
            angle = math.atan2(dy, dx)

            ring = max(r - outer_r, inner_r - r)
            in_gap = abs(angle) < half_gap

            # Rounded sausage terminals at the gap edges.
            t_cov = 0.0
            for sign in (-1.0, 1.0):
                ta = sign * half_gap
                tx = cx + mid_r * math.cos(ta)
                ty = cy + mid_r * math.sin(ta)
                t_cov = max(t_cov, coverage(math.hypot(x - tx, y - ty) - terminal_r))

            if in_gap:
                cov = t_cov
            else:
                cov = max(coverage(ring), t_cov)

            pixels.append(mix(BG, RED, cov))

    return png_rgba(SIZE, SIZE, pixels)


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "plugins/costco-shop/assets/logo.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(generate())
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
