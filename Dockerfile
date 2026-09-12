FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY server.py ./server.py
COPY web ./web

EXPOSE 8080
CMD ["python", "server.py"]
