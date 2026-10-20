import math


def r2(x: float) -> float:
    """Dwa miejsca po przecinku, połówki w górę (jak Math.round w JS, nie bankierskie round())."""
    return math.floor(x * 100 + 0.5) / 100


def round_to(x: float, step: float) -> float:
    """Do najbliższej wielokrotności step (np. 2.5 kg), połówki w górę."""
    return r2(math.floor(x / step + 0.5) * step)
