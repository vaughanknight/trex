---
id: ADR-0005
title: "OpenTelemetry for logging, metrics, and tracing"
status: accepted
date: 2026-02-04
decision_makers: ["@vaughanknight"]
consulted: []
informed: []
supersedes: null
superseded_by: null
tags: ["observability", "logging", "metrics", "opentelemetry"]
complexity: CS-2
---

# ADR-0005: OpenTelemetry for logging, metrics, and tracing

## Context

trex needs observability for:
- **Logging**: Debug information, errors, operational events
- **Metrics**: Session counts, latency, connection stats
- **Health checks**: Startup diagnostics, ongoing health

As a localhost tool, trex doesn't need enterprise-scale observability. But structured logging and metrics are still valuable for debugging and monitoring.

## Decision Drivers

- **Structured output**: JSON logging for easy parsing
- **Flexibility**: Route logs to stdout, files, or external collectors
- **Standard protocol**: Avoid vendor lock-in
- **Lightweight**: Don't add excessive overhead for a desktop tool
- **Future-proof**: If trex ever becomes networked, observability ready

## Considered Options

### Option 1: Standard library logging (log/slog)

**Description**: Use Go's built-in slog package for structured logging.

**Pros**:
- No external dependencies
- Built into Go 1.21+
- Lightweight

**Cons**:
- No metrics or tracing
- Limited routing options
- Not a standard protocol

### Option 2: OpenTelemetry

**Description**: Use OpenTelemetry SDK for logs, metrics, and traces.

**Pros**:
- Industry standard protocol
- Logs, metrics, traces in one framework
- Route to any backend (stdout, file, Jaeger, Prometheus, etc.)
- Future-proof for networked scenarios
- Structured JSON by default

**Cons**:
- Additional dependency
- More setup than plain logging
- Overkill for simple apps

### Option 3: Third-party logging (zerolog, zap)

**Description**: Use a popular Go logging library.

**Pros**:
- Fast, structured logging
- Well-documented

**Cons**:
- Another choice to make (which library?)
- No standard protocol
- No integrated metrics

## Decision

**Chosen Option**: Option 2 (OpenTelemetry) because:

1. **Single framework** for logs, metrics, and traces
2. **Industry standard** - no vendor lock-in
3. **Flexible routing** - stdout for dev, file for debugging, collector for future
4. **Structured JSON** - easy to parse and search
5. **Opt-in telemetry** - crash reporting can use same infrastructure

## Consequences

### Positive

- Consistent observability across the codebase
- Standard format for logs (OTLP)
- Metrics available via health endpoint
- Ready for advanced observability if needed
- Opt-in crash reporting uses same pipeline

### Negative

- OpenTelemetry SDK adds some complexity
- Learning curve for contributors new to OTel
- Slightly heavier than plain logging

### Neutral

- For v1, primarily log to stdout and expose metrics on health endpoint
- External collectors are optional, not required

## Implementation Notes

### Logging

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
)

func (s *SessionService) List(ctx context.Context) ([]Session, error) {
    tracer := otel.Tracer("trex")
    ctx, span := tracer.Start(ctx, "SessionService.List")
    defer span.End()

    sessions, err := s.tmux.ListSessions()
    if err != nil {
        span.RecordError(err)
        return nil, err
    }

    span.SetAttributes(
        attribute.Int("session.count", len(sessions)),
    )

    return sessions, nil
}
```

### Log Levels

| Level | Usage |
|-------|-------|
| DEBUG | Verbose development info |
| INFO | Normal operation events |
| WARN | Recoverable issues |
| ERROR | Failures requiring attention |

### Metrics Exposed

On `/api/health` endpoint:
- `trex.sessions.active` - Current active session count
- `trex.sessions.total` - Total sessions managed
- `trex.websocket.connections` - Active WebSocket connections
- `trex.latency.terminal_io` - Terminal I/O round-trip time

### Configuration

```json
{
  "telemetry": {
    "enabled": true,
    "crash_reporting": false,
    "log_level": "info",
    "exporters": ["stdout"]
  }
}
```

## References

- [Constitution: Observability](../project-rules/constitution.md#observability)
- [OpenTelemetry Go SDK](https://opentelemetry.io/docs/languages/go/)
