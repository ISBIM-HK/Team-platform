"""Auth request/response schemas."""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    is_pm: bool
    is_admin: bool


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str


class RegisterResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
