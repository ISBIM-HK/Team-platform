"""Local contribution clients — push work summaries to the platform.

These run on each member's own machine (next to their Claude Code / Codex /
Cursor / etc.) and deliver work to the platform via a PAT + POST /me/contributions.
The MCP server is the cross-agent entry point; the CLI is a fallback for any
shell. Both share `core` so the ingest contract lives in one place.
"""
