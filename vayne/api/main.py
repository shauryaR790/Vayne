"""FastAPI entrypoint."""

from fastapi import FastAPI

from vayne import __version__

app = FastAPI(title="VAYNE", version=__version__, description="AI Security Analyst API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vayne", "version": __version__}
