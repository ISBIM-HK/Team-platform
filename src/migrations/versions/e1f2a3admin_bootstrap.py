"""admin bootstrap: promote each tenant's earliest user to admin + pm (附录 L)

Revision ID: e1f2a3admin
Revises: d0e1f2skills
Create Date: 2026-05-29

Data-only migration. Fixes the cold-start where is_admin/is_pm were never set:
each tenant's earliest-created user becomes admin+pm. New tenants get this via
the registration bootstrap (first registrant = admin+pm) in auth.register.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e1f2a3admin"
down_revision: Union[str, Sequence[str], None] = "d0e1f2skills"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users SET is_admin = true, is_pm = true
        WHERE id IN (
            SELECT DISTINCT ON (tenant_id) id
            FROM users
            ORDER BY tenant_id, created_at ASC
        )
        """
    )


def downgrade() -> None:
    # Data backfill — no clean revert (cannot know prior role values).
    pass
