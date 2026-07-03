"""Guard against profile-registry drift (modularity finding).

Three independent maps each enumerate the inventory profiles:
  - ``profiles.PROFILE_MAP``            profile -> (tracking_mode, engine_type, strategy_type)
  - ``EngineFactory._profile_registry`` profile -> Engine class (UI / calculation)
  - ``strategies.BEHAVIOR_MAP``         profile -> ProfileBehavior (write / ledger)

Adding a profile to one map but not the others fails *asymmetrically* at
runtime: ``EngineFactory.get_engine_for_profile`` silently falls back to legacy
``engine_type`` dispatch on a miss, while ``BEHAVIOR_MAP`` lookups raise. This
test keeps the three key-sets identical so a new profile must be wired into all
three (or none).
"""

from inventory.engines.factory import EngineFactory
from inventory.strategies import BEHAVIOR_MAP
from inventory.profiles import PROFILE_MAP


def test_profile_registries_have_identical_keys():
    profile_keys = set(PROFILE_MAP)
    engine_keys = set(EngineFactory._profile_registry)
    behavior_keys = set(BEHAVIOR_MAP)

    assert engine_keys == profile_keys, (
        "EngineFactory._profile_registry diverged from PROFILE_MAP: "
        f"missing={profile_keys - engine_keys}, extra={engine_keys - profile_keys}"
    )
    assert behavior_keys == profile_keys, (
        "strategies.BEHAVIOR_MAP diverged from PROFILE_MAP: "
        f"missing={profile_keys - behavior_keys}, extra={behavior_keys - profile_keys}"
    )
