"""add github to eventsource and integrationprovider enums

Revision ID: i1j2k3
Revises: h1i2j3
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op

revision: str = "i1j2k3"
down_revision: Union[str, Sequence[str], None] = "h1i2j3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE eventsource ADD VALUE IF NOT EXISTS 'github'")
    op.execute("ALTER TYPE integrationprovider ADD VALUE IF NOT EXISTS 'github'")


def downgrade() -> None:
    pass
