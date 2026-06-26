"""FastAPI application entrypoint."""

from fastapi import FastAPI

from vayne import __version__

app = FastAPI(
    title="VAYNE",
    description="AI security analyst validation engine",
    version=__version__,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne", "version": __version__}
