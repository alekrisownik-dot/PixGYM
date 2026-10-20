import os
import time
import uuid


def uuid7() -> uuid.UUID:
    """UUIDv7 (RFC 9562): 48 bitów czasu w ms + losowość. Sortuje się chronologicznie."""
    ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10))
    value = (ms & 0xFFFF_FFFF_FFFF) << 80
    value |= 0x7 << 76  # wersja
    value |= ((rand >> 62) & 0xFFF) << 64  # rand_a
    value |= 0b10 << 62  # wariant
    value |= rand & ((1 << 62) - 1)  # rand_b
    return uuid.UUID(int=value)
