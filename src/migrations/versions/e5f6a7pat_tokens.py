"""personal_access_tokens

Revision ID: e5f6a7pat
Revises: d4e5f6contrib
Create Date: 2026-05-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7pat"
down_revision: Union[str, Sequence[str], None] = "d4e5f6contrib"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "personal_access_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pat_tenant_id"), "personal_access_tokens", ["tenant_id"])
    op.create_index(op.f("ix_pat_user_id"), "personal_access_tokens", ["user_id"])
    op.create_index(op.f("ix_pat_token_hash"), "personal_access_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_pat_token_hash"), table_name="personal_access_tokens")
    op.drop_index(op.f("ix_pat_user_id"), table_name="personal_access_tokens")
    op.drop_index(op.f("ix_pat_tenant_id"), table_name="personal_access_tokens")
    op.drop_table("personal_access_tokens")
