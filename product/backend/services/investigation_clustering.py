"""Re-export engine-native investigation clustering."""

from vayne.investigation.clustering import (  # noqa: F401
    build_investigation_clusters,
    _is_pure_service_observation,
)

__all__ = ["build_investigation_clusters", "_is_pure_service_observation"]
