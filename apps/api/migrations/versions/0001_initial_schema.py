"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-20 12:05:21.045335
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table(
        "equipment",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("slug", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment")),
        sa.UniqueConstraint("slug", name=op.f("uq_equipment_slug")),
    )
    op.create_table(
        "movement_patterns",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("slug", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_movement_patterns")),
        sa.UniqueConstraint("slug", name=op.f("uq_movement_patterns_slug")),
    )
    op.create_table(
        "muscle_groups",
        sa.Column("id", sa.SmallInteger(), autoincrement=False, nullable=False),
        sa.Column("slug", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column(
            "region",
            sa.Enum(
                "upper", "lower", "core", name="region", native_enum=False, create_constraint=False
            ),
            nullable=False,
        ),
        sa.CheckConstraint(
            "region IN ('upper', 'lower', 'core')", name=op.f("ck_muscle_groups_region")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_muscle_groups")),
        sa.UniqueConstraint("slug", name=op.f("uq_muscle_groups_slug")),
    )
    op.create_table(
        "users",
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(length=50), nullable=False),
        sa.Column(
            "role",
            sa.Enum("user", "admin", name="userrole", native_enum=False, create_constraint=False),
            server_default="user",
            nullable=False,
        ),
        sa.Column(
            "sex",
            sa.Enum("male", "female", name="sex", native_enum=False, create_constraint=False),
            nullable=True,
        ),
        sa.Column("birth_year", sa.SmallInteger(), nullable=True),
        sa.Column("timezone", sa.Text(), server_default="Europe/Warsaw", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('user', 'admin')", name=op.f("ck_users_userrole")),
        sa.CheckConstraint("sex IN ('male', 'female')", name=op.f("ck_users_sex")),
        sa.CheckConstraint("birth_year BETWEEN 1900 AND 2100", name=op.f("ck_users_birth_year")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_audit_log_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_log")),
    )
    op.create_index(
        op.f("ix_audit_log_user_id_created_at"),
        "audit_log",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "body_measurements",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("body_fat_pct", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("waist_cm", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("chest_cm", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("arm_cm", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("thigh_cm", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("hip_cm", sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("arm_cm BETWEEN 10 AND 300", name=op.f("ck_body_measurements_arm_cm")),
        sa.CheckConstraint(
            "body_fat_pct BETWEEN 1 AND 75", name=op.f("ck_body_measurements_body_fat_pct")
        ),
        sa.CheckConstraint(
            "chest_cm BETWEEN 10 AND 300", name=op.f("ck_body_measurements_chest_cm")
        ),
        sa.CheckConstraint("hip_cm BETWEEN 10 AND 300", name=op.f("ck_body_measurements_hip_cm")),
        sa.CheckConstraint(
            "thigh_cm BETWEEN 10 AND 300", name=op.f("ck_body_measurements_thigh_cm")
        ),
        sa.CheckConstraint(
            "waist_cm BETWEEN 10 AND 300", name=op.f("ck_body_measurements_waist_cm")
        ),
        sa.CheckConstraint(
            "weight_kg BETWEEN 20 AND 400", name=op.f("ck_body_measurements_weight_kg")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_body_measurements_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_body_measurements")),
    )
    op.create_index(
        op.f("ix_body_measurements_user_id_measured_at"),
        "body_measurements",
        ["user_id", "measured_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_body_measurements_user_id_server_version"),
        "body_measurements",
        ["user_id", "server_version"],
        unique=False,
    )
    op.create_table(
        "data_jobs",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("export", "import", name="jobkind", native_enum=False, create_constraint=False),
            nullable=False,
        ),
        sa.Column(
            "source",
            sa.Enum(
                "json",
                "csv",
                "strong",
                "hevy",
                name="jobsource",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "running",
                "done",
                "failed",
                name="jobstatus",
                native_enum=False,
                create_constraint=False,
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("kind IN ('export', 'import')", name=op.f("ck_data_jobs_jobkind")),
        sa.CheckConstraint(
            "source IN ('json', 'csv', 'strong', 'hevy')", name=op.f("ck_data_jobs_jobsource")
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')",
            name=op.f("ck_data_jobs_jobstatus"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_data_jobs_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_data_jobs")),
    )
    op.create_index(op.f("ix_data_jobs_user_id"), "data_jobs", ["user_id"], unique=False)
    op.create_table(
        "exercises",
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("slug", sa.String(length=60), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("equipment_id", sa.SmallInteger(), nullable=False),
        sa.Column("movement_pattern_id", sa.SmallInteger(), nullable=True),
        sa.Column(
            "tracking",
            sa.Enum(
                "weight_reps",
                "bodyweight_reps",
                "duration",
                "distance",
                name="tracking",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("is_unilateral", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("bw_factor", sa.Numeric(precision=3, scale=2), nullable=True),
        sa.Column("video_url", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "tracking IN ('weight_reps', 'bodyweight_reps', 'duration', 'distance')",
            name=op.f("ck_exercises_tracking"),
        ),
        sa.CheckConstraint("video_url LIKE 'https://%'", name=op.f("ck_exercises_video_url_https")),
        sa.CheckConstraint(
            "bw_factor > 0 AND bw_factor <= 1.5", name=op.f("ck_exercises_bw_factor")
        ),
        sa.CheckConstraint(
            "slug IS NULL OR owner_user_id IS NULL", name=op.f("ck_exercises_slug_only_builtin")
        ),
        sa.ForeignKeyConstraint(
            ["equipment_id"], ["equipment.id"], name=op.f("fk_exercises_equipment_id_equipment")
        ),
        sa.ForeignKeyConstraint(
            ["movement_pattern_id"],
            ["movement_patterns.id"],
            name=op.f("fk_exercises_movement_pattern_id_movement_patterns"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_exercises_owner_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_exercises")),
        sa.UniqueConstraint("slug", name=op.f("uq_exercises_slug")),
    )
    op.create_index(
        op.f("ix_exercises_owner_user_id_server_version"),
        "exercises",
        ["owner_user_id", "server_version"],
        unique=False,
    )
    op.create_index(
        "uq_exercises_owner_name",
        "exercises",
        ["owner_user_id", sa.literal_column("lower(name)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
        postgresql_nulls_not_distinct=True,
    )
    op.create_table(
        "invites",
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("used_by", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_invites_created_by_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["used_by"], ["users.id"], name=op.f("fk_invites_used_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("code_hash", name=op.f("pk_invites")),
    )
    op.create_table(
        "mfa_totp",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("secret_enc", sa.LargeBinary(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_mfa_totp_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_mfa_totp")),
    )
    op.create_table(
        "programs",
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("slug", sa.String(length=60), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "split",
            sa.Enum(
                "fbw",
                "upper_lower",
                "ppl",
                "wendler_531",
                "gzclp",
                "nsuns",
                "custom",
                name="split",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("is_template", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "split IN ('fbw', 'upper_lower', 'ppl', 'wendler_531', 'gzclp', 'nsuns', 'custom')",
            name=op.f("ck_programs_split"),
        ),
        sa.CheckConstraint(
            "owner_user_id IS NOT NULL OR is_template", name=op.f("ck_programs_builtin_is_template")
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_programs_owner_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_programs")),
        sa.UniqueConstraint("slug", name=op.f("uq_programs_slug")),
    )
    op.create_index(
        op.f("ix_programs_owner_user_id_server_version"),
        "programs",
        ["owner_user_id", "server_version"],
        unique=False,
    )
    op.create_table(
        "progression_rules",
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("slug", sa.String(length=60), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "double",
                "linear",
                "rpe",
                "wendler_531",
                "gzclp",
                "nsuns",
                name="progressiontype",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "type IN ('double', 'linear', 'rpe', 'wendler_531', 'gzclp', 'nsuns')",
            name=op.f("ck_progression_rules_progressiontype"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_progression_rules_owner_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_progression_rules")),
        sa.UniqueConstraint("slug", name=op.f("uq_progression_rules_slug")),
    )
    op.create_index(
        op.f("ix_progression_rules_owner_user_id_server_version"),
        "progression_rules",
        ["owner_user_id", "server_version"],
        unique=False,
    )
    op.create_table(
        "recovery_codes",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_recovery_codes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recovery_codes")),
    )
    op.create_index(op.f("ix_recovery_codes_user_id"), "recovery_codes", ["user_id"], unique=False)
    op.create_table(
        "refresh_tokens",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_refresh_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_refresh_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_refresh_tokens_user_id_family_id"),
        "refresh_tokens",
        ["user_id", "family_id"],
        unique=False,
    )
    op.create_table(
        "sync_conflicts",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entity", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("field", sa.Text(), nullable=False),
        sa.Column("lost_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_sync_conflicts_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sync_conflicts")),
    )
    op.create_index(op.f("ix_sync_conflicts_user_id"), "sync_conflicts", ["user_id"], unique=False)
    op.create_table(
        "sync_ops",
        sa.Column("op_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_sync_ops_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("op_id", name=op.f("pk_sync_ops")),
    )
    op.create_index(op.f("ix_sync_ops_user_id"), "sync_ops", ["user_id"], unique=False)
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "weight_unit",
            sa.Enum("kg", "lb", name="weightunit", native_enum=False, create_constraint=False),
            server_default="kg",
            nullable=False,
        ),
        sa.Column(
            "e1rm_method",
            sa.Enum(
                "epley",
                "brzycki",
                "rpe",
                name="e1rmmethod",
                native_enum=False,
                create_constraint=False,
            ),
            server_default="epley",
            nullable=False,
        ),
        sa.Column("e1rm_max_reps", sa.SmallInteger(), server_default="12", nullable=False),
        sa.Column(
            "bar_weight_kg", sa.Numeric(precision=4, scale=2), server_default="20", nullable=False
        ),
        sa.Column("plate_inventory", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("default_rest_s", sa.SmallInteger(), server_default="120", nullable=False),
        sa.Column("body_consent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "e1rm_method IN ('epley', 'brzycki', 'rpe')", name=op.f("ck_user_settings_e1rmmethod")
        ),
        sa.CheckConstraint("weight_unit IN ('kg', 'lb')", name=op.f("ck_user_settings_weightunit")),
        sa.CheckConstraint(
            "bar_weight_kg BETWEEN 0 AND 50", name=op.f("ck_user_settings_bar_weight_kg")
        ),
        sa.CheckConstraint(
            "default_rest_s BETWEEN 0 AND 1800", name=op.f("ck_user_settings_default_rest_s")
        ),
        sa.CheckConstraint(
            "e1rm_max_reps BETWEEN 1 AND 20", name=op.f("ck_user_settings_e1rm_max_reps")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_settings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_settings")),
    )
    op.create_table(
        "exercise_muscles",
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("muscle_group_id", sa.SmallInteger(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "primary",
                "secondary",
                name="musclerole",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("contribution", sa.Numeric(precision=2, scale=1), nullable=False),
        sa.CheckConstraint(
            "role IN ('primary', 'secondary')", name=op.f("ck_exercise_muscles_musclerole")
        ),
        sa.CheckConstraint(
            "contribution > 0 AND contribution <= 1", name=op.f("ck_exercise_muscles_contribution")
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_exercise_muscles_exercise_id_exercises"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["muscle_group_id"],
            ["muscle_groups.id"],
            name=op.f("fk_exercise_muscles_muscle_group_id_muscle_groups"),
        ),
        sa.PrimaryKeyConstraint("exercise_id", "muscle_group_id", name=op.f("pk_exercise_muscles")),
    )
    op.create_index(
        op.f("ix_exercise_muscles_muscle_group_id"),
        "exercise_muscles",
        ["muscle_group_id"],
        unique=False,
    )
    op.create_table(
        "program_versions",
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("is_current", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["program_id"],
            ["programs.id"],
            name=op.f("fk_program_versions_program_id_programs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_program_versions")),
        sa.UniqueConstraint(
            "program_id", "version_no", name=op.f("uq_program_versions_program_id_version_no")
        ),
    )
    op.create_index(
        "uq_program_versions_current",
        "program_versions",
        ["program_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )
    op.create_table(
        "program_days",
        sa.Column("program_version_id", sa.Uuid(), nullable=False),
        sa.Column("day_index", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("is_deload", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["program_version_id"],
            ["program_versions.id"],
            name=op.f("fk_program_days_program_version_id_program_versions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_program_days")),
        sa.UniqueConstraint(
            "program_version_id",
            "day_index",
            name=op.f("uq_program_days_program_version_id_day_index"),
        ),
    )
    op.create_table(
        "program_exercises",
        sa.Column("program_day_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("superset_group", sa.SmallInteger(), nullable=True),
        sa.Column("target_sets", sa.SmallInteger(), nullable=False),
        sa.Column("rep_min", sa.SmallInteger(), nullable=True),
        sa.Column("rep_max", sa.SmallInteger(), nullable=True),
        sa.Column("target_rpe", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.Column("tempo", sa.String(length=7), nullable=True),
        sa.Column("rest_s", sa.SmallInteger(), nullable=True),
        sa.Column("set_scheme", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("progression_rule_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "tempo ~ '^[0-9X]-[0-9X]-[0-9X]-[0-9X]$'", name=op.f("ck_program_exercises_tempo")
        ),
        sa.CheckConstraint(
            "rep_max BETWEEN 1 AND 100 AND rep_max >= rep_min",
            name=op.f("ck_program_exercises_rep_max"),
        ),
        sa.CheckConstraint("rep_min BETWEEN 1 AND 100", name=op.f("ck_program_exercises_rep_min")),
        sa.CheckConstraint("rest_s BETWEEN 0 AND 1800", name=op.f("ck_program_exercises_rest_s")),
        sa.CheckConstraint(
            "target_rpe BETWEEN 1 AND 10 AND target_rpe * 2 = trunc(target_rpe * 2)",
            name=op.f("ck_program_exercises_target_rpe"),
        ),
        sa.CheckConstraint(
            "target_sets BETWEEN 1 AND 20", name=op.f("ck_program_exercises_target_sets")
        ),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_program_exercises_exercise_id_exercises"),
        ),
        sa.ForeignKeyConstraint(
            ["program_day_id"],
            ["program_days.id"],
            name=op.f("fk_program_exercises_program_day_id_program_days"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["progression_rule_id"],
            ["progression_rules.id"],
            name=op.f("fk_program_exercises_progression_rule_id_progression_rules"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_program_exercises")),
        sa.UniqueConstraint(
            "program_day_id", "position", name=op.f("uq_program_exercises_program_day_id_position")
        ),
    )
    op.create_index(
        op.f("ix_program_exercises_exercise_id"), "program_exercises", ["exercise_id"], unique=False
    )
    op.create_table(
        "workout_sessions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("program_version_id", sa.Uuid(), nullable=True),
        sa.Column("program_day_id", sa.Uuid(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("bodyweight_kg", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "bodyweight_kg BETWEEN 20 AND 400", name=op.f("ck_workout_sessions_bodyweight_kg")
        ),
        sa.CheckConstraint(
            "ended_at >= started_at", name=op.f("ck_workout_sessions_ended_after_started")
        ),
        sa.ForeignKeyConstraint(
            ["program_day_id"],
            ["program_days.id"],
            name=op.f("fk_workout_sessions_program_day_id_program_days"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["program_version_id"],
            ["program_versions.id"],
            name=op.f("fk_workout_sessions_program_version_id_program_versions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_workout_sessions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workout_sessions")),
        sa.UniqueConstraint("id", "user_id", name=op.f("uq_workout_sessions_id_user_id")),
    )
    op.create_index(
        op.f("ix_workout_sessions_user_id_local_date"),
        "workout_sessions",
        ["user_id", "local_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workout_sessions_user_id_server_version"),
        "workout_sessions",
        ["user_id", "server_version"],
        unique=False,
    )
    op.create_table(
        "session_exercises",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("superset_group", sa.SmallInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_session_exercises_exercise_id_exercises"),
        ),
        sa.ForeignKeyConstraint(
            ["session_id", "user_id"],
            ["workout_sessions.id", "workout_sessions.user_id"],
            name=op.f("fk_session_exercises_session_id_user_id_workout_sessions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_session_exercises_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_session_exercises")),
        sa.UniqueConstraint("id", "user_id", name=op.f("uq_session_exercises_id_user_id")),
    )
    op.create_index(
        op.f("ix_session_exercises_session_id"), "session_exercises", ["session_id"], unique=False
    )
    op.create_index(
        op.f("ix_session_exercises_user_id_exercise_id"),
        "session_exercises",
        ["user_id", "exercise_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_session_exercises_user_id_server_version"),
        "session_exercises",
        ["user_id", "server_version"],
        unique=False,
    )
    op.create_table(
        "sets",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("session_exercise_id", sa.Uuid(), nullable=False),
        sa.Column("set_index", sa.SmallInteger(), nullable=False),
        sa.Column(
            "set_type",
            sa.Enum(
                "warmup",
                "working",
                "drop",
                "failure",
                "amrap",
                name="settype",
                native_enum=False,
                create_constraint=False,
            ),
            server_default="working",
            nullable=False,
        ),
        sa.Column(
            "side",
            sa.Enum(
                "both", "left", "right", name="side", native_enum=False, create_constraint=False
            ),
            server_default="both",
            nullable=False,
        ),
        sa.Column("weight_kg", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("added_kg", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("reps", sa.SmallInteger(), nullable=True),
        sa.Column("duration_s", sa.Integer(), nullable=True),
        sa.Column("distance_m", sa.Integer(), nullable=True),
        sa.Column("rpe", sa.Numeric(precision=3, scale=1), nullable=True),
        sa.Column("rir", sa.SmallInteger(), nullable=True),
        sa.Column("effective_kg", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("e1rm_kg", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "set_type IN ('warmup', 'working', 'drop', 'failure', 'amrap')",
            name=op.f("ck_sets_settype"),
        ),
        sa.CheckConstraint("side IN ('both', 'left', 'right')", name=op.f("ck_sets_side")),
        sa.CheckConstraint("added_kg BETWEEN -300 AND 1000", name=op.f("ck_sets_added_kg")),
        sa.CheckConstraint("distance_m BETWEEN 0 AND 1000000", name=op.f("ck_sets_distance_m")),
        sa.CheckConstraint("duration_s BETWEEN 0 AND 86400", name=op.f("ck_sets_duration_s")),
        sa.CheckConstraint("reps BETWEEN 0 AND 100", name=op.f("ck_sets_reps")),
        sa.CheckConstraint("rir BETWEEN 0 AND 10", name=op.f("ck_sets_rir")),
        sa.CheckConstraint(
            "rpe BETWEEN 1 AND 10 AND rpe * 2 = trunc(rpe * 2)", name=op.f("ck_sets_rpe")
        ),
        sa.CheckConstraint("set_index BETWEEN 0 AND 100", name=op.f("ck_sets_set_index")),
        sa.CheckConstraint("weight_kg BETWEEN 0 AND 1000", name=op.f("ck_sets_weight_kg")),
        sa.ForeignKeyConstraint(
            ["session_exercise_id", "user_id"],
            ["session_exercises.id", "session_exercises.user_id"],
            name=op.f("fk_sets_session_exercise_id_user_id_session_exercises"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_sets_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sets")),
        sa.UniqueConstraint("id", "user_id", name=op.f("uq_sets_id_user_id")),
    )
    op.create_index(
        op.f("ix_sets_session_exercise_id"), "sets", ["session_exercise_id"], unique=False
    )
    op.create_index(
        op.f("ix_sets_user_id_server_version"), "sets", ["user_id", "server_version"], unique=False
    )
    op.create_table(
        "personal_records",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column(
            "record_type",
            sa.Enum(
                "one_rm",
                "e1rm",
                "rep_max",
                "set_volume",
                "bodyweight_reps",
                name="recordtype",
                native_enum=False,
                create_constraint=False,
            ),
            nullable=False,
        ),
        sa.Column("reps", sa.SmallInteger(), nullable=True),
        sa.Column("value", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("set_id", sa.Uuid(), nullable=True),
        sa.Column("achieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "server_version", sa.BigInteger(), server_default=sa.FetchedValue(), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(record_type = 'rep_max') = (reps IS NOT NULL)",
            name=op.f("ck_personal_records_reps_only_for_rep_max"),
        ),
        sa.CheckConstraint(
            "record_type IN ('one_rm', 'e1rm', 'rep_max', 'set_volume', 'bodyweight_reps')",
            name=op.f("ck_personal_records_recordtype"),
        ),
        sa.CheckConstraint("value >= 0", name=op.f("ck_personal_records_value")),
        sa.ForeignKeyConstraint(
            ["exercise_id"],
            ["exercises.id"],
            name=op.f("fk_personal_records_exercise_id_exercises"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["set_id", "user_id"],
            ["sets.id", "sets.user_id"],
            name=op.f("fk_personal_records_set_id_user_id_sets"),
            ondelete="SET NULL (set_id)",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_personal_records_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_personal_records")),
    )
    op.create_index(
        op.f("ix_personal_records_user_id_server_version"),
        "personal_records",
        ["user_id", "server_version"],
        unique=False,
    )
    op.create_index(
        "uq_personal_records_current",
        "personal_records",
        ["user_id", "exercise_id", "record_type", "reps"],
        unique=True,
        postgresql_where=sa.text("superseded_at IS NULL"),
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_personal_records_current",
        table_name="personal_records",
        postgresql_where=sa.text("superseded_at IS NULL"),
        postgresql_nulls_not_distinct=True,
    )
    op.drop_index(op.f("ix_personal_records_user_id_server_version"), table_name="personal_records")
    op.drop_table("personal_records")
    op.drop_index(op.f("ix_sets_user_id_server_version"), table_name="sets")
    op.drop_index(op.f("ix_sets_session_exercise_id"), table_name="sets")
    op.drop_table("sets")
    op.drop_index(
        op.f("ix_session_exercises_user_id_server_version"), table_name="session_exercises"
    )
    op.drop_index(op.f("ix_session_exercises_user_id_exercise_id"), table_name="session_exercises")
    op.drop_index(op.f("ix_session_exercises_session_id"), table_name="session_exercises")
    op.drop_table("session_exercises")
    op.drop_index(op.f("ix_workout_sessions_user_id_server_version"), table_name="workout_sessions")
    op.drop_index(op.f("ix_workout_sessions_user_id_local_date"), table_name="workout_sessions")
    op.drop_table("workout_sessions")
    op.drop_index(op.f("ix_program_exercises_exercise_id"), table_name="program_exercises")
    op.drop_table("program_exercises")
    op.drop_table("program_days")
    op.drop_index(
        "uq_program_versions_current",
        table_name="program_versions",
        postgresql_where=sa.text("is_current"),
    )
    op.drop_table("program_versions")
    op.drop_index(op.f("ix_exercise_muscles_muscle_group_id"), table_name="exercise_muscles")
    op.drop_table("exercise_muscles")
    op.drop_table("user_settings")
    op.drop_index(op.f("ix_sync_ops_user_id"), table_name="sync_ops")
    op.drop_table("sync_ops")
    op.drop_index(op.f("ix_sync_conflicts_user_id"), table_name="sync_conflicts")
    op.drop_table("sync_conflicts")
    op.drop_index(op.f("ix_refresh_tokens_user_id_family_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_recovery_codes_user_id"), table_name="recovery_codes")
    op.drop_table("recovery_codes")
    op.drop_index(
        op.f("ix_progression_rules_owner_user_id_server_version"), table_name="progression_rules"
    )
    op.drop_table("progression_rules")
    op.drop_index(op.f("ix_programs_owner_user_id_server_version"), table_name="programs")
    op.drop_table("programs")
    op.drop_table("mfa_totp")
    op.drop_table("invites")
    op.drop_index(
        "uq_exercises_owner_name",
        table_name="exercises",
        postgresql_where=sa.text("deleted_at IS NULL"),
        postgresql_nulls_not_distinct=True,
    )
    op.drop_index(op.f("ix_exercises_owner_user_id_server_version"), table_name="exercises")
    op.drop_table("exercises")
    op.drop_index(op.f("ix_data_jobs_user_id"), table_name="data_jobs")
    op.drop_table("data_jobs")
    op.drop_index(
        op.f("ix_body_measurements_user_id_server_version"), table_name="body_measurements"
    )
    op.drop_index(op.f("ix_body_measurements_user_id_measured_at"), table_name="body_measurements")
    op.drop_table("body_measurements")
    op.drop_index(op.f("ix_audit_log_user_id_created_at"), table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_table("users")
    op.drop_table("muscle_groups")
    op.drop_table("movement_patterns")
    op.drop_table("equipment")
    op.execute("DROP EXTENSION IF EXISTS citext")
