"""events_cache.project_id + EventSource 'agent'

Revision ID: d4e5f6contrib
Revises: c1a2b3projects
Create Date: 2026-05-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6contrib"
down_revision: Union[str, Sequence[str], None] = "c1a2b3projects"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # add 'agent' to the native eventsource enum (autocommit: ADD VALUE can't run in a tx block)
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE eventsource ADD VALUE IF NOT EXISTS 'agent'")

    op.add_column("events_cache", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_events_project", "events_cache", "projects", ["project_id"], ["id"])
    op.create_index(op.f("ix_events_cache_project_id"), "events_cache", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_events_cache_project_id"), table_name="events_cache")
    op.drop_constraint("fk_events_project", "events_cache", type_="foreignkey")
    op.drop_column("events_cache", "project_id")
    # note: leaving the 'agent' enum value in place (removing a PG enum value is non-trivial)
