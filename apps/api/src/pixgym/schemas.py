"""Modele wejścia i wyjścia API (Pydantic)."""

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

# Liczby z bazy (Decimal) wychodzą jako zwykłe liczby JSON, nie napisy.
Num = float


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- konto ---


class RegisterIn(BaseModel):
    invite_code: str = Field(min_length=4, max_length=40)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=10, max_length=200)
    display_name: str = Field(min_length=1, max_length=50)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class MeOut(Out):
    id: uuid.UUID
    email: str
    display_name: str
    role: str
    sex: str | None
    birth_year: int | None
    leaderboard_visible: bool


class MeIn(BaseModel):
    display_name: str | None = Field(None, min_length=1, max_length=50)
    sex: Literal["male", "female"] | None = None
    birth_year: int | None = Field(None, ge=1900, le=2100)
    leaderboard_visible: bool | None = None


class InviteOut(BaseModel):
    code: str
    expires_at: datetime


class InviteListItem(Out):
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None


# --- ćwiczenia i treningi ---


class ExercisePhotoOut(Out):
    id: uuid.UUID
    caption: str | None


class ExerciseOut(Out):
    id: uuid.UUID
    slug: str | None
    name: str
    tracking: str
    is_unilateral: bool
    equipment: str
    custom: bool
    notes: str | None
    photos: list[ExercisePhotoOut]


Tracking = Literal["weight_reps", "bodyweight_reps", "duration", "distance"]


class ExerciseIn(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=2, max_length=100)
    equipment: str = Field(max_length=30)
    tracking: Tracking = "weight_reps"
    primary_muscle: str = Field(max_length=30)
    secondary_muscles: list[str] = Field(default_factory=list, max_length=6)
    is_unilateral: bool = False
    notes: str | None = Field(None, max_length=1000)


class ExercisePatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    notes: str | None = Field(None, max_length=1000)


class NamedSlug(BaseModel):
    slug: str
    name: str


class CatalogMetaOut(BaseModel):
    equipment: list[NamedSlug]
    muscles: list[NamedSlug]


class SettingsOut(Out):
    default_rest_s: int
    bar_weight_kg: Num
    plate_inventory: dict[str, int]


class SettingsIn(BaseModel):
    default_rest_s: int | None = Field(None, ge=0, le=1800)
    bar_weight_kg: float | None = Field(None, ge=0, le=50)
    plate_inventory: dict[str, int] | None = None


class SessionIn(BaseModel):
    id: uuid.UUID | None = None
    started_at: datetime | None = None
    bodyweight_kg: float | None = Field(None, ge=20, le=400)
    program_day_id: uuid.UUID | None = None


class SessionPatch(BaseModel):
    ended_at: datetime | None = None
    bodyweight_kg: float | None = Field(None, ge=20, le=400)
    notes: str | None = Field(None, max_length=2000)


class SessionListItem(Out):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    local_date: date
    exercise_count: int
    set_count: int
    tonnage_kg: Num


SetType = Literal["warmup", "working", "drop", "failure", "amrap"]


class SetIn(BaseModel):
    session_exercise_id: uuid.UUID
    set_index: int = Field(ge=0, le=100)
    set_type: SetType = "working"
    side: Literal["both", "left", "right"] = "both"
    weight_kg: float | None = Field(None, ge=0, le=1000)
    added_kg: float | None = Field(None, ge=-300, le=1000)
    reps: int | None = Field(None, ge=0, le=100)
    duration_s: int | None = Field(None, ge=0, le=86400)
    distance_m: int | None = Field(None, ge=0, le=1_000_000)
    rpe: float | None = Field(None, ge=1, le=10, multiple_of=0.5)
    rir: int | None = Field(None, ge=0, le=10)
    completed_at: datetime | None = None


class SetOut(Out):
    id: uuid.UUID
    session_exercise_id: uuid.UUID
    set_index: int
    set_type: str
    side: str
    weight_kg: Num | None
    added_kg: Num | None
    reps: int | None
    duration_s: int | None
    distance_m: int | None
    rpe: Num | None
    rir: int | None
    completed_at: datetime | None
    effective_kg: Num | None
    e1rm_kg: Num | None


class RecordOut(Out):
    record_type: str
    reps: int | None
    value: Num


class SetRecordOut(RecordOut):
    beat_previous: bool


class SavedSetOut(SetOut):
    records: list[SetRecordOut]


class SessionExerciseIn(BaseModel):
    id: uuid.UUID | None = None
    exercise_id: uuid.UUID


class BlockIn(BaseModel):
    """Bloczek dnia planu: ćwiczenie z celem serii i powtórzeń."""

    exercise_id: uuid.UUID
    target_sets: int = Field(3, ge=1, le=20)
    rep_min: int | None = Field(8, ge=1, le=100)
    # None przy rep_min = AMRAP (co najmniej rep_min).
    rep_max: int | None = Field(12, ge=1, le=100)
    target_rpe: float | None = Field(None, ge=1, le=10, multiple_of=0.5)
    rest_s: int | None = Field(None, ge=0, le=1800)
    superset_group: int | None = Field(None, ge=0, le=100)
    # Serie procentowe z szablonów (5/3/1, nSuns); przy kopiowaniu przechodzą bez zmian.
    set_scheme: list[dict[str, Any]] | None = Field(None, max_length=20)
    progression_rule_id: uuid.UUID | None = None
    notes: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def _reps(self):
        if self.rep_min is not None and self.rep_max is not None and self.rep_max < self.rep_min:
            raise ValueError("rep_max < rep_min")
        return self


class BlockOut(Out):
    exercise_id: uuid.UUID
    target_sets: int
    rep_min: int | None
    rep_max: int | None
    target_rpe: Num | None
    rest_s: int | None
    superset_group: int | None
    set_scheme: list[dict[str, Any]] | None
    progression_rule_id: uuid.UUID | None
    notes: str | None


class PlanBlockOut(BlockOut):
    id: uuid.UUID
    name: str
    tracking: str


class PlanDayIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    weekdays: list[int] = Field(default_factory=list, max_length=7)
    blocks: list[BlockIn] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def _weekdays(self):
        if any(not 0 <= d <= 6 for d in self.weekdays):
            raise ValueError("weekday 0..6")
        return self


class PlanDayOut(BaseModel):
    id: uuid.UUID
    day_index: int
    name: str
    weekdays: list[int]
    blocks: list[PlanBlockOut]


class PlanIn(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=2000)
    days: list[PlanDayIn] = Field(min_length=1, max_length=14)


class PlanOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    split: str
    builtin: bool
    version_id: uuid.UUID
    version_no: int
    active: bool
    days: list[PlanDayOut]


class PlanListItem(Out):
    id: uuid.UUID
    name: str
    description: str | None
    split: str
    builtin: bool
    days: int
    active: bool


class ActivePlanIn(BaseModel):
    program_id: uuid.UUID | None


class SessionExerciseOut(Out):
    id: uuid.UUID
    exercise_id: uuid.UUID
    position: int
    notes: str | None
    name: str
    tracking: str
    sets: list[SetOut]
    target: BlockOut | None = None


class SessionOut(Out):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    local_date: date
    bodyweight_kg: Num | None
    notes: str | None
    program_day_id: uuid.UUID | None = None
    day_name: str | None = None
    exercises: list[SessionExerciseOut]


class LastPerformanceOut(BaseModel):
    date: date
    sets: list[SetOut]


# --- postęp ---


class TrainedExerciseOut(Out):
    id: uuid.UUID
    name: str
    tracking: str
    last_date: date
    sessions: int
    e1rm_kg: Num | None


class ExerciseRecordOut(RecordOut):
    achieved_at: datetime


class E1rmPoint(BaseModel):
    date: date
    e1rm_kg: Num


class RankOut(BaseModel):
    lift: str
    name: str
    tier: int | None
    title: str | None
    ratio: float | None
    next_title: str | None
    next_at_kg: float | None
    progress: float | None


class LeaderboardRowOut(BaseModel):
    position: int
    display_name: str
    value: float
    e1rm_kg: float
    title: str | None
    is_me: bool


class BadgeOut(BaseModel):
    slug: str
    title: str
    description: str
    earned_at: str | None
    progress: float


class CalendarDay(BaseModel):
    date: date
    sessions: int
    sets: int
    tonnage_kg: float


class CalendarOut(BaseModel):
    days: list[CalendarDay]
    week_streak: int
    total_days: int


class MuscleVolumeOut(BaseModel):
    muscle: str
    name: str
    hard_sets: float
    tonnage_kg: float


class SummaryExercise(BaseModel):
    exercise_id: uuid.UUID
    name: str
    sets: int
    tonnage_kg: float
    best_e1rm_kg: float | None


class SummaryRecord(BaseModel):
    name: str
    record_type: str
    reps: int | None
    value: Num


class SessionSummaryOut(BaseModel):
    id: uuid.UUID
    local_date: date
    duration_s: int
    sets: int
    reps: int
    tonnage_kg: float
    exercises: list[SummaryExercise]
    records: list[SummaryRecord]
    previous_date: date | None
    previous_tonnage_kg: float | None
