# Contributing to trex

Thank you for your interest in contributing to trex!

## Project Status

**trex is currently a single-maintainer project.** This means:

- Response times may be slow - please be patient
- Not all contributions will be accepted
- Alignment with project vision is important

## Before Contributing

1. **Read the Constitution**: Review [docs/project-rules/constitution.md](docs/project-rules/constitution.md) to understand the project's principles and direction.

2. **Check existing issues**: Search for related issues before creating new ones.

3. **Discuss before building**: For anything beyond small fixes, open an issue first to discuss the approach.

## How to Contribute

### Reporting Bugs

1. Check if the bug is already reported
2. Use the [bug report template](.github/ISSUE_TEMPLATE/bug.md)
3. Include reproduction steps, environment details, and expected vs actual behavior

### Requesting Features

1. Open an issue using the [feature template](.github/ISSUE_TEMPLATE/feature.md)
2. Include a complexity estimate (CS 1-5)
3. For CS ≥ 3, discussion is required before implementation

### Submitting Code

1. **Fork the repository**
2. **Create a feature branch** from `main`
3. **Write tests first** (TDD is the standard)
4. **Follow coding standards**:
   - Use fakes, not mocks
   - Include Test Doc blocks
   - Follow Conventional Commits
5. **Submit a PR** using the [PR template](.github/pull_request_template.md)

### Small Fixes

For typos, documentation fixes, and other small changes:
- A PR is welcome without prior issue discussion
- Still follow the PR template and coding standards

## Development Setup

```bash
# Clone the repository
git clone https://github.com/vaughanknight/trex.git
cd trex

# Install dependencies
go mod download
cd frontend && npm install

# Run tests
go test ./...
cd frontend && npm test

# Build
go build -o trex ./cmd/trex
```

## Coding Standards

- **Go**: gofmt, godoc comments on exports
- **TypeScript**: ESLint + Prettier, strict mode, JSDoc on exports
- **Tests**: Fakes only (no mocks), Test Doc blocks required
- **Commits**: Conventional Commits format

See [docs/project-rules/rules.md](docs/project-rules/rules.md) for complete requirements.

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Link to the related issue
4. Request review from maintainer
5. Address feedback
6. Maintainer will squash-merge when approved

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Please be respectful and constructive.

## Questions?

Use [GitHub Discussions](https://github.com/vaughanknight/trex/discussions) for questions and ideas.
