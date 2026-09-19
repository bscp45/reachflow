"""
celery_app.py — Background job queue.

Two jobs run here:

  1. Post-call analysis — reads a transcript, decides the outcome, writes
     score and sentiment. Kept off the request path so a slow OpenAI
     response cannot make Vapi treat the webhook as failed and retry it.

  2. Retry scheduling — the 2-hour and 30-day re-attempts. These need
     scheduled execution, which is why Celery rather than FastAPI's
     BackgroundTasks.

RUNNING THE WORKER (Windows)

    cd backend
    venv\\Scripts\\activate
    celery -A app.celery_app worker --loglevel=info --pool=solo

The --pool=solo flag matters. Celery's default prefork pool relies on
fork(), which Windows does not have, and the worker will accept jobs but
never execute them. Solo runs one task at a time in the main process —
fine for development, not for production throughput.
"""

import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "reachflow",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,

    # A stuck task should fail rather than hold a worker indefinitely
    task_time_limit=120,
    task_soft_time_limit=90,

    # Only fetch one job at a time, so a slow task does not leave others
    # sitting in a worker's local buffer while another worker is idle
    worker_prefetch_multiplier=1,

    # Acknowledge after completion rather than on receipt — if a worker
    # dies mid-task the job returns to the queue instead of vanishing
    task_acks_late=True,

    result_expires=3600,
)
