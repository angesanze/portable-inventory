"""EngineFactory: profile/engine_type -> engine instance."""
from typing import Any, Dict

from .base import BaseEngine
from .numeric import CounterEngine, ConverterEngine, DimensionEngine
from .batch import BucketEngine, TimeBasedEngine
from .tracker import TrackerEngine


class EngineFactory:
    """
    Factory to instantiate the appropriate engine for a product.
    """
    _engines = {
        "counter": CounterEngine,
        "converter": ConverterEngine,
        "bucket": BucketEngine,
        "tracker": TrackerEngine,
        "dimension": DimensionEngine,
        "time_based": TimeBasedEngine,
    }

    # Profile → engine class registry
    _profile_registry = {
        'SIMPLE_COUNT': CounterEngine,
        'UNIT_CONVERSION': ConverterEngine,
        'DIMENSIONAL': DimensionEngine,
        'BATCH_TRACKED': BucketEngine,
        'PERISHABLE': TimeBasedEngine,
        'SERIALIZED': TrackerEngine,
        'ASSEMBLED': CounterEngine,
    }

    @classmethod
    def get_engine(cls, product) -> BaseEngine:
        """
        Instantiates an engine based on the product type.

        Args:
            product: The product instance with engine_type and engine_config.

        Returns:
            BaseEngine: An implementation of the polymorphic inventory logic.
        """
        engine_cls = cls._engines.get(product.engine_type)
        if not engine_cls:
            raise ValueError(f"No engine found for type: {product.engine_type}")
        return engine_cls(product, product.engine_config)

    @classmethod
    def get_engine_for_profile(cls, product) -> BaseEngine:
        """
        Instantiate engine based on product.profile.

        Accepts a ProductModel instance.
        Uses profile for dispatch, falls back to engine_type for backward compat.
        """
        profile = getattr(product, 'profile', None)

        if profile and profile in cls._profile_registry:
            engine_cls = cls._profile_registry[profile]
            config = getattr(product, 'engine_config', {})
            return engine_cls(product, config)

        # Fallback to legacy dispatch
        return cls.get_engine(product)

    @classmethod
    def validate_config(cls, engine_type: str, config: Dict[str, Any]) -> list:
        """
        Validate engine_config for a given engine_type.
        Returns list of error strings. Empty list = valid.
        """
        engine_cls = cls._engines.get(engine_type)
        if not engine_cls:
            return [f"Unknown engine type: {engine_type}"]
        return engine_cls.validate_config(config)

