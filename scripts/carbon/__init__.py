"""Carbon API integration package for Hermes agent.

This package provides:
- Client: low-level HTTP client for Carbon API
- Idempotency: idempotency key generation and local ledger
- Key rotation: primary/fallback key selection from environment

Enabled via CARBON_ENABLED=true in .env.
"""
