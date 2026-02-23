from fastapi import APIRouter, Depends

from app.models import AuthTokensDto, CurrentUserDto, LoginInput, TokenRefreshInput
from app.services.auth import get_current_user, login_user, logout_refresh_token, refresh_auth_tokens

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthTokensDto)
def post_login(input_data: LoginInput) -> AuthTokensDto:
    return login_user(input_data)


@router.post("/refresh", response_model=AuthTokensDto)
def post_refresh(input_data: TokenRefreshInput) -> AuthTokensDto:
    return refresh_auth_tokens(input_data.refreshToken)


@router.post("/logout")
def post_logout(input_data: TokenRefreshInput) -> dict[str, bool]:
    logout_refresh_token(input_data.refreshToken)
    return {"ok": True}


@router.get("/me", response_model=CurrentUserDto)
def get_me(current_user: CurrentUserDto = Depends(get_current_user)) -> CurrentUserDto:
    return current_user
