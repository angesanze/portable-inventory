"""Guard against the two profile registries drifting apart (audit M5).

`EngineFactory._profile_registry` (profile -> Engine) and
`strategies.BEHAVIOR_MAP` (profile -> ProfileBehavior) are maintained by hand.
If a new INVENTORY_PROFILES entry is added to one but not the other, dispatch
silently breaks for that profile. These tests assert both cover every profile.
"""

from inventory.constants import INVENTORY_PROFILES
from inventory.engines import EngineFactory
from inventory.strategies import BEHAVIOR_MAP


def test_every_profile_has_an_engine():
    profiles = {code for code, _ in INVENTORY_PROFILES}
    missing = profiles - set(EngineFactory._profile_registry)
    assert not missing, f"profiles missing from EngineFactory._profile_registry: {missing}"


def test_every_profile_has_a_behavior():
    profiles = {code for code, _ in INVENTORY_PROFILES}
    missing = profiles - set(BEHAVIOR_MAP)
    assert not missing, f"profiles missing from BEHAVIOR_MAP: {missing}"


def test_registries_cover_the_same_profiles():
    assert set(EngineFactory._profile_registry) == set(BEHAVIOR_MAP), (
        "EngineFactory._profile_registry and BEHAVIOR_MAP disagree: "
        f"{set(EngineFactory._profile_registry) ^ set(BEHAVIOR_MAP)}"
    )
