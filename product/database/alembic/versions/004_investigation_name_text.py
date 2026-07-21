"""Widen investigation name and source_filename for multi-file uploads."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004_investigation_name_text"
down_revision: Union[str, None] = "003_investigation_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE investigations ALTER COLUMN name TYPE TEXT")
        op.execute("ALTER TABLE investigations ALTER COLUMN source_filename TYPE TEXT")
    else:
        # SQLite ignores declared types on ALTER; recreate not required for dev.
        with op.batch_alter_table("investigations") as batch:
            batch.alter_column("name", type_=sa.Text(), existing_type=sa.String(255))
            batch.alter_column(
                "source_filename",
                type_=sa.Text(),
                existing_type=sa.String(512),
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE investigations ALTER COLUMN name TYPE VARCHAR(255)"
        )
        op.execute(
            "ALTER TABLE investigations ALTER COLUMN source_filename TYPE VARCHAR(512)"
        )
