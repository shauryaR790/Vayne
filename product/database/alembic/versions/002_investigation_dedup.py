"""Add investigation deduplication columns."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002_investigation_dedup"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "investigations",
        sa.Column("investigation_key", sa.String(64), nullable=True),
    )
    op.add_column(
        "investigations",
        sa.Column("source_filename", sa.String(512), nullable=False, server_default=""),
    )
    op.add_column(
        "investigations",
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "investigations",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_investigations_key",
        "investigations",
        ["investigation_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_investigations_key", table_name="investigations")
    op.drop_column("investigations", "updated_at")
    op.drop_column("investigations", "summary")
    op.drop_column("investigations", "source_filename")
    op.drop_column("investigations", "investigation_key")
