"""
Inventory Profile system — single-axis product configuration.

Each profile maps to exactly one (tracking_mode, engine_type, strategy_type|None)
tuple. This module provides:
- PROFILE_MAP: canonical mapping table
- derive_profile(): infer profile from legacy fields
- profile_to_legacy(): get legacy fields from profile
"""

from typing import Optional, Tuple, Dict
from .constants import (
    PROFILE_SIMPLE_COUNT,
    PROFILE_UNIT_CONVERSION,
    PROFILE_DIMENSIONAL,
    PROFILE_BATCH_TRACKED,
    PROFILE_PERISHABLE,
    PROFILE_SERIALIZED,
    PROFILE_ASSEMBLED,
    TRACKING_MODE_BULK,
    TRACKING_MODE_INDIVIDUAL,
    TRACKING_MODE_BATCH,
    ENGINE_TYPE_COUNTER,
    ENGINE_TYPE_CONVERTER,
    ENGINE_TYPE_DIMENSION,
    ENGINE_TYPE_BUCKET,
    ENGINE_TYPE_TIME_BASED,
    ENGINE_TYPE_TRACKER,
    STRATEGY_TYPE_CONVERTER,
    STRATEGY_TYPE_DIMENSION,
    STRATEGY_TYPE_BUCKET,
    STRATEGY_TYPE_TIME,
    STRATEGY_TYPE_ASSEMBLY,
)


# ── Canonical Mapping ────────────────────────────────────────────────
# (profile) → (tracking_mode, engine_type, strategy_type_or_None)

PROFILE_MAP: Dict[str, Tuple[str, str, Optional[str]]] = {
    PROFILE_SIMPLE_COUNT: (TRACKING_MODE_BULK, ENGINE_TYPE_COUNTER, None),
    PROFILE_UNIT_CONVERSION: (TRACKING_MODE_BULK, ENGINE_TYPE_CONVERTER, STRATEGY_TYPE_CONVERTER),
    PROFILE_DIMENSIONAL: (TRACKING_MODE_BULK, ENGINE_TYPE_DIMENSION, STRATEGY_TYPE_DIMENSION),
    PROFILE_BATCH_TRACKED: (TRACKING_MODE_BATCH, ENGINE_TYPE_BUCKET, STRATEGY_TYPE_BUCKET),
    PROFILE_PERISHABLE: (TRACKING_MODE_BATCH, ENGINE_TYPE_TIME_BASED, STRATEGY_TYPE_TIME),
    PROFILE_SERIALIZED: (TRACKING_MODE_INDIVIDUAL, ENGINE_TYPE_TRACKER, None),
    PROFILE_ASSEMBLED: (TRACKING_MODE_BULK, ENGINE_TYPE_COUNTER, STRATEGY_TYPE_ASSEMBLY),
}

# Reverse lookup: (tracking_mode, engine_type, strategy_type|None) → profile
_REVERSE_MAP: Dict[Tuple[str, str, Optional[str]], str] = {v: k for k, v in PROFILE_MAP.items()}


def derive_profile(
    tracking_mode: str,
    engine_type: str,
    strategy_type: Optional[str] = None,
) -> Optional[str]:
    """
    Infer the InventoryProfile from legacy field values.

    Returns profile string or None if combination doesn't match any known profile.

    Handles fuzzy cases:
    - BULK + counter + no strategy → SIMPLE_COUNT
    - BULK + counter + ASSEMBLY → ASSEMBLED
    - BATCH + bucket + BUCKET → BATCH_TRACKED
    - BATCH + time_based + TIME → PERISHABLE
    - BATCH + time_based + BUCKET → PERISHABLE (TIME overrides BUCKET for time_based engine)
    """
    # Exact match first
    key = (tracking_mode, engine_type, strategy_type)
    if key in _REVERSE_MAP:
        return _REVERSE_MAP[key]

    # Fuzzy: BATCH + time_based with any strategy → PERISHABLE
    if tracking_mode == TRACKING_MODE_BATCH and engine_type == ENGINE_TYPE_TIME_BASED:
        return PROFILE_PERISHABLE

    # Fuzzy: BULK + counter + any non-ASSEMBLY strategy → SIMPLE_COUNT
    if tracking_mode == TRACKING_MODE_BULK and engine_type == ENGINE_TYPE_COUNTER:
        if strategy_type == STRATEGY_TYPE_ASSEMBLY:
            return PROFILE_ASSEMBLED
        return PROFILE_SIMPLE_COUNT

    # Fuzzy: BULK + converter + any strategy → UNIT_CONVERSION
    if tracking_mode == TRACKING_MODE_BULK and engine_type == ENGINE_TYPE_CONVERTER:
        return PROFILE_UNIT_CONVERSION

    # Fuzzy: BULK + dimension + any strategy → DIMENSIONAL
    if tracking_mode == TRACKING_MODE_BULK and engine_type == ENGINE_TYPE_DIMENSION:
        return PROFILE_DIMENSIONAL

    # Fuzzy: BATCH + bucket + any strategy → BATCH_TRACKED
    if tracking_mode == TRACKING_MODE_BATCH and engine_type == ENGINE_TYPE_BUCKET:
        return PROFILE_BATCH_TRACKED

    # Fuzzy: INDIVIDUAL + tracker + any strategy → SERIALIZED
    if tracking_mode == TRACKING_MODE_INDIVIDUAL and engine_type == ENGINE_TYPE_TRACKER:
        return PROFILE_SERIALIZED

    return None


def profiles_for_tracking_mode(tracking_mode: str) -> list:
    """Return profile keys that map to the given tracking_mode."""
    return [p for p, (tm, _, _) in PROFILE_MAP.items() if tm == tracking_mode]


def profile_to_legacy(profile: str) -> Tuple[str, str, Optional[str]]:
    """
    Get the canonical (tracking_mode, engine_type, strategy_type) for a profile.

    Raises KeyError if profile is not recognized.
    """
    return PROFILE_MAP[profile]
