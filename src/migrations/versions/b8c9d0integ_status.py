"""Integration rich status: integrations.status (IntegrationStatus enum)

Revision ID: b8c9d0integ
Revises: a7b8c9workspace
Create Date: 2026-05-29

Adds a native `integrationstatus` enum + `integrations.status` column, backfilled
from `enabled` (enabled=false → disabled). `enabled` is kept for dual-write and
dropped in a later release (§7.5 add → dual-write → drop).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0integ"
down_revision: Union[str, Sequence[str], None] = "a7b8c9workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    status_enum = sa.Enum("active", "disabled", "expired", "error", name="integrationstatus")
    status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "integrations",
        sa.Column("status", status_enum, nullable=False, server_default="active"),
    )
    op.execute("UPDATE integrations SET status = 'disabled' WHERE enabled = false")


def downgrade() -> None:
    op.drop_column("integrations", "status")
    sa.Enum(name="integrationstatus").drop(op.get_bind(), checkfirst=True)
