FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Production installs runtime deps only. Dev/test images pass INSTALL_DEV=1
# (see docker-compose.yml) to additionally pull pytest + debug tooling, so the
# prod image never ships dev dependencies (BP-05).
ARG INSTALL_DEV=0
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_DEV" = "1" ]; then pip install --no-cache-dir -r requirements-dev.txt; fi

COPY . .
