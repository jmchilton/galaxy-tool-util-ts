.PHONY: all lint format typecheck test check fix format-fix

all: check test

lint:
	pnpm -r lint

format:
	pnpm -r format

format-fix:
	pnpm -r format-fix

typecheck:
	pnpm -r typecheck

test:
	pnpm -r test

check: lint format typecheck

fix: format-fix
	pnpm -r lint -- --fix
