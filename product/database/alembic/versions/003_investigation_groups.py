"""Add investigation group and mode columns."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003_investigation_groups"
down_revision: Union[str, None] = "002_investigation_dedup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "investigations",
        sa.Column("investigation_group_id", sa.String(36), nullable=True),
    )
    op.add_column(
        "investigations",
        sa.Column("mode", sa.String(16), nullable=False, server_default="combined"),
    )
    op.add_column(
        "investigations",
        sa.Column("group_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "idx_investigations_group",
        "investigations",
        ["investigation_group_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_investigations_group", table_name="investigations")
    op.drop_column("investigations", "group_index")
    op.drop_column("investigations", "mode")
    op.drop_column("investigations", "investigation_group_id")
