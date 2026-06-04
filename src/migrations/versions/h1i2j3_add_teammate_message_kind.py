"""add teammate_message notification kind

Revision ID: h1i2j3
Revises: 0307ac210f88
Create Date: 2026-06-04
"""
from typing import Sequence, Union

from alembic import op


revision: str = "h1i2j3"
down_revision: Union[str, Sequence[str], None] = "0307ac210f88"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notificationkind ADD VALUE IF NOT EXISTS 'teammate_message'")


def downgrade() -> None:
    pass  # PG enums cannot remove values; safe to leave
