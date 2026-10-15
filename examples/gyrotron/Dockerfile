FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY gyrotron ./gyrotron
COPY wsgi.py ./
RUN python -m pip install --no-cache-dir '.[postgres]'
EXPOSE 8000
CMD ["sh", "-c", "python -c 'from gyrotron import create_app; create_app()' && exec gunicorn --bind 0.0.0.0:8000 --workers 2 wsgi:app"]
