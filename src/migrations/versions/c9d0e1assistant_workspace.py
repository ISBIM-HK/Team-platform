"""assistant_workspaces (附录 J — persistent assistant workspace)

Revision ID: c9d0e1assistant
Revises: b8c9d0integ
Create Date: 2026-05-29

One row per user: persona / memory / profile markdown docs, owner-only.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1assistant"
down_revision: Union[str, Sequence[str], None] = "b8c9d0integ"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_workspaces",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("persona_md", sa.String(), nullable=False, server_default=""),
        sa.Column("memory_md", sa.String(), nullable=False, server_default=""),
        sa.Column("profile_md", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assistant_workspaces_tenant_id"), "assistant_workspaces", ["tenant_id"]
    )
    op.create_index(
        op.f("ix_assistant_workspaces_user_id"), "assistant_workspaces", ["user_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_assistant_workspaces_user_id"), table_name="assistant_workspaces")
    op.drop_index(op.f("ix_assistant_workspaces_tenant_id"), table_name="assistant_workspaces")
    op.drop_table("assistant_workspaces")
