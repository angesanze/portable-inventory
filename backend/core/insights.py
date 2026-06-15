"""Pure, unit-testable per-company health scoring for the superadmin console.

A health score is a 0-100 integer derived only from a handful of boolean/count
signals about a company's state. The scoring function lives here — free of
Django, the ORM, and request context — so it can be exercised directly in unit
tests and reused by any caller. :class:`core.platform_metrics.PlatformHealthView`
gathers the signals with DB aggregation and feeds them in.
"""
from dataclasses import dataclass

# Each signal contributes up to this many points; the weights sum to 100 so a
# company with every signal positive (and no anomalies) scores a perfect 100.
WEIGHTS = {
    'active': 30,            # not suspended
    'has_users': 20,         # at least one user
    'has_key': 20,           # at least one API key
    'recent_activity': 20,   # a movement within the dormancy window
    'no_anomalies': 10,      # no detected anomalies at all
}


@dataclass(frozen=True)
class HealthSignals:
    """The minimal company state the score is computed from.

    All fields are plain Python values so this stays decoupled from the ORM.
    ``anomaly_count`` is the number of anomalies the insights detector surfaced
    for the company (0 earns the ``no_anomalies`` bonus).
    """

    is_active: bool
    has_users: bool
    has_key: bool
    has_recent_activity: bool
    anomaly_count: int = 0


def compute_health_score(signals: HealthSignals):
    """Return ``(score, factors)`` for a company's health signals.

    ``score`` is a deterministic integer in ``[0, 100]``; ``factors`` is the
    per-signal points breakdown ``{name: points_awarded}`` so callers can
    explain *why* a company scored what it did. Given equal input the output is
    always identical — no randomness, no clock, no I/O.
    """
    factors = {
        'active': WEIGHTS['active'] if signals.is_active else 0,
        'has_users': WEIGHTS['has_users'] if signals.has_users else 0,
        'has_key': WEIGHTS['has_key'] if signals.has_key else 0,
        'recent_activity': WEIGHTS['recent_activity'] if signals.has_recent_activity else 0,
        'no_anomalies': WEIGHTS['no_anomalies'] if signals.anomaly_count == 0 else 0,
    }
    score = sum(factors.values())
    # Weights are designed to sum to 100, but clamp defensively so the contract
    # (0-100) holds even if a weight is ever retuned.
    score = max(0, min(100, score))
    return score, factors
