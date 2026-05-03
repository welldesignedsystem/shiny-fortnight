FROM python:3.14-slim

WORKDIR /app
ENV PYTHONPATH=/app/src

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "fastmcp>=3.2.4" "pyyaml>=6.0.0"

RUN mkdir -p /mnt/curator-host

COPY src /app/src
COPY config.yaml /app/config.yaml

VOLUME ["/mnt/curator-host"]
EXPOSE 8000

CMD ["python", "-m", "curator.server"]
