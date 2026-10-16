# React interface is built into static assets and served by Flask.
FROM node:22-alpine AS frontend
WORKDIR /work/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY gyrotron ./gyrotron
COPY --from=frontend /work/gyrotron/static/app ./gyrotron/static/app
COPY wsgi.py ./
RUN python -m pip install --no-cache-dir '.[postgres]'
EXPOSE 8000
CMD ["sh", "-c", "python -c 'from gyrotron import create_app; create_app()' && exec gunicorn --bind 0.0.0.0:8000 --workers 2 wsgi:app"]
