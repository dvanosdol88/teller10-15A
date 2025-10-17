"""Request/response schemas for API resources."""
from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


class EnrollmentUser(BaseModel):
    """Schema for the user object within an enrollment payload."""

    model_config = ConfigDict(extra="allow")

    id: str = Field(..., description="Unique Teller user identifier")
    name: Optional[str] = Field(default=None, description="Optional user display name")

    @field_validator("id")
    @classmethod
    def _validate_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("user.id must not be empty")
        return cleaned


class EnrollmentPayload(BaseModel):
    """Schema for the root enrollment payload supplied by Teller Connect."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    access_token: str = Field(
        ...,
        description="Teller access token for the enrolled user",
        validation_alias=AliasChoices("accessToken", "access_token"),
    )
    user: EnrollmentUser

    @field_validator("access_token")
    @classmethod
    def _validate_access_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("accessToken must not be empty")
        return cleaned


class EnrollmentRequest(BaseModel):
    """Envelope schema for enrollment requests."""

    model_config = ConfigDict(extra="allow")

    enrollment: EnrollmentPayload

    @model_validator(mode="before")
    @classmethod
    def _unwrap_enrollment(cls, value: Any) -> Dict[str, Any]:
        """Support both wrapped and raw enrollment payloads."""

        if isinstance(value, dict):
            if "enrollment" in value and isinstance(value["enrollment"], dict):
                return value
            return {"enrollment": value}
        raise TypeError("Enrollment payload must be a JSON object")
