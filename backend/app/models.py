"""Pydantic models mirroring README section 4 (API) and section 5 (data model)."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Interest = Literal["sights", "food", "football"]
Category = Literal["sights", "food", "football", "other"]


class PlanRequest(BaseModel):
    destination: str = Field(min_length=1)
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    interests: list[Interest] = Field(min_length=1)
    notes: str | None = None
    want_docx: bool = False

    @model_validator(mode="after")
    def check_dates(self) -> "PlanRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class PlanCreated(BaseModel):
    plan_id: str


class TripItem(BaseModel):
    time: str | None = None
    duration_min: int | None = None
    title: str
    description: str = ""
    category: Category = "other"
    agent: str
    location: str | None = None
    price_level: Literal["€", "€€", "€€€"] | None = None
    source_url: str | None = None


class TripDay(BaseModel):
    date: str
    title: str = ""
    items: list[TripItem] = []


class TripPlan(BaseModel):
    plan_id: str
    destination: str
    start_date: str
    end_date: str
    summary: str = ""
    agents_used: list[str] = []
    days: list[TripDay]
    highlights: dict[str, list[str]] = {}
    warnings: list[str] = []
