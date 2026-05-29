"""workspace AI assist + notifications: tasks.impl_hint + NotificationKind values

Revision ID: a7b8c9workspace
Revises: f6a7b8brief
Create Date: 2026-05-29

Additive only (附录 I): two nullable columns on tasks (AI impl-hint) and two new
values on the native `notificationkind` enum (task_assigned / task_claimed).
Enum values are added in an autocommit block (PostgreSQL forbids using a newly
added enum value in the same transaction).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9workspace"
down_revision: Union[str, Sequence[str], None] = "f6a7b8brief"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE notificationkind ADD VALUE IF NOT EXISTS 'task_assigned'")
        op.execute("ALTER TYPE notificationkind ADD VALUE IF NOT EXISTS 'task_claimed'")
    op.add_column("tasks", sa.Column("impl_hint", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("impl_hint_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    # PostgreSQL cannot drop enum values cleanly; the two values are left in place.
    op.drop_column("tasks", "impl_hint_updated_at")
    op.drop_column("tasks", "impl_hint")
