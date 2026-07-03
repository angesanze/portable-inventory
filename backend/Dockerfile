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

# Collect static files into STATIC_ROOT for WhiteNoise to serve in-process (no
# bucket needed). Needs a SECRET_KEY at build time — a throwaway value is fine,
# it never reaches runtime (Cloud Run injects the real one from Secret Manager).
RUN SECRET_KEY=build-only-collectstatic python manage.py collectstatic --noinput

# Cloud Run injects $PORT (8080). Gunicorn serves the WSGI app; migrations run
# as a separate CI/deploy step, never at container start (avoids multi-instance
# races).
ENV PORT=8080
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind :${PORT} --workers 2 --threads 4 --timeout 60 --access-logfile - --error-logfile -"]
