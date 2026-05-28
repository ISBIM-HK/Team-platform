.PHONY: setup dev test migrate lint docker-up docker-down

setup:
	conda run -n team-platform pip install -e ".[dev]"
	docker compose up -d postgres
	@echo "Waiting for postgres..."
	@sleep 3
	conda run -n team-platform alembic upgrade head
	@echo "✅ Setup complete. Run 'make dev' to start."

dev:
	conda run -n team-platform uvicorn src.api.app:app --reload --host 0.0.0.0 --port 8000

test:
	conda run -n team-platform pytest -v

migrate:
	conda run -n team-platform alembic revision --autogenerate -m "$(name)"
	conda run -n team-platform alembic upgrade head

lint:
	conda run -n team-platform ruff check src/ tests/
	conda run -n team-platform ruff format --check src/ tests/

docker-up:
	docker compose up -d

docker-down:
	docker compose down
