FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt README.md ./
COPY vayne ./vayne
COPY product ./product
COPY scripts ./scripts

RUN pip install --no-cache-dir -r requirements.txt && pip install -e .

ENV PYTHONPATH=/app

CMD ["bash", "scripts/start_api.sh"]
