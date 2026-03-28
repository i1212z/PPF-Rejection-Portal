"""Compute Due desk aging: amount moves Safe → Warning → Danger → Doubtful by phase length (days)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Tuple

Phase = Literal["safe", "warning", "danger", "doubtful"]


def _aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def elapsed_days(approved_at: datetime, end_at: datetime) -> float:
    a = _aware_utc(approved_at)
    e = _aware_utc(end_at)
    return max(0.0, (e - a).total_seconds() / 86400.0)


def compute_phase_and_buckets(
    approved_at: datetime,
    paid_at: datetime | None,
    phase_length_days: int,
    total_amount: float,
    now: datetime | None = None,
) -> Tuple[Phase, float, float, float, float, str]:
    """
    Returns phase, safe, warning, danger, doubtful, timer_label.
    If paid_at set, aging freezes at payment time.
    """
    now = now or datetime.now(timezone.utc)
    L = max(1, int(phase_length_days))
    end = paid_at if paid_at is not None else now
    elapsed = elapsed_days(approved_at, end)

    # Phase index 0..3+
    if elapsed < L:
        rem = L - elapsed
        phase: Phase = "safe"
        label = f"Safe · {rem:.1f}d left in phase"
    elif elapsed < 2 * L:
        rem = 2 * L - elapsed
        phase = "warning"
        label = f"Warning · {rem:.1f}d left in phase"
    elif elapsed < 3 * L:
        rem = 3 * L - elapsed
        phase = "danger"
        label = f"Danger · {rem:.1f}d left in phase"
    else:
        phase = "doubtful"
        label = "Doubtful · final phase"

    t = float(total_amount)
    s = w = d = db = 0.0
    if phase == "safe":
        s = t
    elif phase == "warning":
        w = t
    elif phase == "danger":
        d = t
    else:
        db = t

    return phase, s, w, d, db, label
