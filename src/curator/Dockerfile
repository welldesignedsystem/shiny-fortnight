FROM python:3.14-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "fastmcp>=3.2.4" "pyyaml>=6.0.0"

COPY src/curator-tools /app/curator-tools

WORKDIR /app/curator-tools

CMD ["python", "server.py"]
