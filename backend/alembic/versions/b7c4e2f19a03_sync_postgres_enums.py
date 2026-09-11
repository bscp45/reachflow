"""sync postgres enums with model definitions

Alembic autogenerate does not detect changes to enum *values* — it only
compares tables, columns, indexes and constraints. When UserRole gained
reachflow_manager / client_owner / client_manager / client_analyst and
LeadStatus gained pending_approval, the Postgres types were left untouched.
This migration rebuilds both types to match models.py.

Rebuilding rather than using ALTER TYPE ... ADD VALUE because we also need
to *remove* the retired client_admin and client_viewer values, and Postgres
has no ADD VALUE equivalent for removal.

Revision ID: b7c4e2f19a03
Revises: 41d593cdfc47
"""
from alembic import op

revision = "b7c4e2f19a03"
down_revision = "41d593cdfc47"
branch_labels = None
depends_on = None


# Values as defined in app/models.py
USER_ROLES = (
    "super_admin",
    "reachflow_manager",
    "client_owner",
    "client_manager",
    "client_analyst",
)

LEAD_STATUSES = (
    "pending",
    "pending_approval",
    "calling",
    "agreed",
    "declined",
    "no_answer",
)

# The values this database had before the rebuild, for downgrade()
OLD_USER_ROLES = ("super_admin", "client_admin", "client_viewer")
OLD_LEAD_STATUSES = ("pending", "calling", "agreed", "declined", "no_answer")


def _enum_literal(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    # ── userrole ──────────────────────────────────────────────────────────────
    # Detach the column from the type, drop it, recreate it, reattach.
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50)")
    op.execute("DROP TYPE userrole")
    op.execute(f"CREATE TYPE userrole AS ENUM ({_enum_literal(USER_ROLES)})")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::userrole"
    )

    # ── leadstatus ────────────────────────────────────────────────────────────
    # Two columns depend on this type, and leads.status carries a DEFAULT that
    # must be dropped first — Postgres will not alter a type while a default
    # expression still references it.
    op.execute("ALTER TABLE leads ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE leads ALTER COLUMN status TYPE VARCHAR(50)")
    op.execute("ALTER TABLE call_logs ALTER COLUMN status TYPE VARCHAR(50)")

    op.execute("DROP TYPE leadstatus")
    op.execute(f"CREATE TYPE leadstatus AS ENUM ({_enum_literal(LEAD_STATUSES)})")

    op.execute(
        "ALTER TABLE leads ALTER COLUMN status TYPE leadstatus USING status::leadstatus"
    )
    op.execute(
        "ALTER TABLE call_logs ALTER COLUMN status TYPE leadstatus USING status::leadstatus"
    )
    op.execute("ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'pending'")


def downgrade() -> None:
    # Note: rows holding a retired value will fail the cast. Acceptable here
    # because downgrade is only ever run against a database that has not yet
    # used the new values.
    op.execute("ALTER TABLE leads ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE leads ALTER COLUMN status TYPE VARCHAR(50)")
    op.execute("ALTER TABLE call_logs ALTER COLUMN status TYPE VARCHAR(50)")
    op.execute("DROP TYPE leadstatus")
    op.execute(f"CREATE TYPE leadstatus AS ENUM ({_enum_literal(OLD_LEAD_STATUSES)})")
    op.execute(
        "ALTER TABLE leads ALTER COLUMN status TYPE leadstatus USING status::leadstatus"
    )
    op.execute(
        "ALTER TABLE call_logs ALTER COLUMN status TYPE leadstatus USING status::leadstatus"
    )
    op.execute("ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'pending'")

    op.execute("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50)")
    op.execute("DROP TYPE userrole")
    op.execute(f"CREATE TYPE userrole AS ENUM ({_enum_literal(OLD_USER_ROLES)})")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::userrole"
    )
