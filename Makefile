.PHONY: all lint format typecheck test check

all: check test

# Run ESLint
lint:
	npx eslint src/ test/

# Run Prettier (check mode — fails if unformatted)
format:
	npx prettier --check 'src/**/*.ts' 'test/**/*.ts'

# Format in-place
format-fix:
	npx prettier --write 'src/**/*.ts' 'test/**/*.ts'

# Run TypeScript compiler in check mode
typecheck:
	npx tsc --noEmit

# Run tests
test:
	npx vitest run

# All static checks (no tests)
check: lint format typecheck

# Fix all auto-fixable issues
fix: format-fix
	npx eslint --fix src/ test/
