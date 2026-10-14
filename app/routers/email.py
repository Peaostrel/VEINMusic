"""Private email settings, single-use verification and password recovery."""
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.core.security import get_admin_user, get_current_user, get_password_hash, revoke_all_sessions, verify_password
from app.database import get_db
from app.models import EmailAccount, EmailOutbox, User
from app.services import email_delivery as mail

router = APIRouter(tags=["email"])
DB = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(get_current_user)]
Admin = Annotated[User, Depends(get_admin_user)]
INVALID_LINK = "Ссылка недействительна или устарела"
ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"description": "Invalid input or expired token"},
    403: {"description": "Forbidden"},
    409: {"description": "Address already linked"},
    429: {"description": "Rate limit"},
    503: {"description": "Email delivery not configured"},
}


class Address(BaseModel):
    email: str = Field(min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        import re
        value = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}", value) or ".." in value:
            raise ValueError("Введите корректный адрес почты")
        return value


class Credentials(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    otp_code: str | None = Field(default=None, max_length=64)


class Bind(Address, Credentials):
    pass


class Token(BaseModel):
    token: str = Field(min_length=32, max_length=128)


class Reset(Token, Credentials):
    pass


class Preferences(BaseModel):
    security_alerts: bool
    messages_enabled: bool


class Message(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    subject: str = Field(min_length=1, max_length=150)
    text: str = Field(min_length=1, max_length=5000)


def require_delivery():
    if not mail.configured():
        raise HTTPException(503, "Почтовый сервис пока не подключён")


def authenticate(db, user, data):
    if not verify_password(data.password, str(user.hashed_password)):
        raise HTTPException(400, "Неверный пароль")
    second_factor(db, user, data.otp_code)


def second_factor(db, user, code):
    if user.totp_enabled:
        from app.services.mfa import consume_code
        if not code or not consume_code(db, user, code):
            raise HTTPException(400, "Введите действующий код двухфакторной защиты")


def budget(db, user_id, kind):
    recent = db.query(EmailOutbox.id).filter(
        EmailOutbox.user_id == user_id,
        EmailOutbox.kind == kind,
        EmailOutbox.created_at > datetime.now(UTC) - timedelta(days=1),
    ).count()
    return recent < 5


def cancel(db, user_id, kind):
    db.query(EmailOutbox).filter_by(user_id=user_id, kind=kind, status="pending").update(
        {"status": "cancelled", "payload": "{}"}, synchronize_session=False)


@router.get("/api/account/email")
def settings(response: Response, db: DB, user: Owner):
    response.headers["Cache-Control"] = "no-store"
    row = db.get(EmailAccount, user.id)
    return {"configured": mail.configured(), "email": row.email if row else None,
            "pending_email": row.pending_email if row else None,
            "security_alerts": bool(row.security_alerts) if row else True,
            "messages_enabled": bool(row.messages_enabled) if row else False}


@router.post("/api/account/email", responses=ERRORS)
@limiter.limit("3/hour")
def bind(request: Request, data: Bind, db: DB, user: Owner):
    require_delivery()
    authenticate(db, user, data)
    if not budget(db, user.id, "verify"):
        raise HTTPException(429, "Лимит писем на сегодня исчерпан")
    row = db.get(EmailAccount, user.id)
    if row is None:
        row = EmailAccount(user_id=user.id)
        db.add(row)
    if db.query(EmailAccount.user_id).filter(EmailAccount.email == data.email).first():
        raise HTTPException(409, "Этот адрес уже привязан")
    raw = secrets.token_urlsafe(32)
    row.pending_email = data.email  # type: ignore[assignment]
    row.verify_hash = mail.digest(raw)
    row.verify_stamp = mail.digest(str(user.hashed_password))
    row.verify_expires = datetime.now(UTC) + timedelta(minutes=30)  # type: ignore[assignment]
    cancel(db, user.id, "verify")
    mail.queue(db, user.id, "verify", data.email, "Подтвердите почту VEIN Music",
               f"Подтвердите привязку почты к аккаунту {user.username}. Ссылка действует 30 минут.\n"
               "Если вы не запрашивали это письмо, проигнорируйте его.", mail.site_url() + "/email/verify#" + raw)
    db.commit()
    return {"message": "Письмо подтверждения поставлено в очередь"}


def active_token(db, raw, purpose):
    column = EmailAccount.verify_hash if purpose == "verify" else EmailAccount.reset_hash
    row = db.query(EmailAccount).filter(column == mail.digest(raw)).with_for_update().first()
    expiry = getattr(row, purpose + "_expires", None)
    if row is None or expiry is None or expiry.replace(tzinfo=UTC) <= datetime.now(UTC):
        raise HTTPException(400, INVALID_LINK)
    return row


@router.post("/auth/email/verify", responses=ERRORS)
@limiter.limit("10/minute")
def verify(request: Request, data: Token, db: DB):
    row = active_token(db, data.token, "verify")
    user = db.get(User, row.user_id)
    if not user or user.is_banned or row.verify_stamp != mail.digest(str(user.hashed_password)):
        raise HTTPException(400, INVALID_LINK)
    row.email = row.pending_email
    row.pending_email = row.verify_hash = row.verify_expires = row.verify_stamp = None
    row.reset_hash = row.reset_expires = None
    cancel(db, row.user_id, "reset")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Этот адрес уже привязан") from None
    return {"message": "Почта подтверждена"}


@router.patch("/api/account/email", responses=ERRORS)
def preferences(data: Preferences, db: DB, user: Owner):
    row = db.get(EmailAccount, user.id)
    if not row or not row.email:
        raise HTTPException(400, "Сначала подтвердите почту")
    row.security_alerts = data.security_alerts  # type: ignore[assignment]
    row.messages_enabled = data.messages_enabled  # type: ignore[assignment]
    db.commit()
    return {"message": "Настройки сохранены"}


@router.delete("/api/account/email", responses=ERRORS)
@limiter.limit("5/hour")
def unlink(request: Request, data: Credentials, db: DB, user: Owner):
    authenticate(db, user, data)
    db.query(EmailOutbox).filter_by(user_id=user.id, status="pending").update({"status": "cancelled", "payload": "{}"})
    db.query(EmailAccount).filter_by(user_id=user.id).delete()
    db.commit()
    return {"message": "Почта отвязана"}


@router.post("/auth/password/forgot", responses=ERRORS)
@limiter.limit("3/hour")
def forgot(request: Request, data: Address, db: DB):
    require_delivery()
    row = db.query(EmailAccount).filter_by(email=data.email).with_for_update().first()
    user = db.get(User, row.user_id) if row else None
    if row and user and not user.is_banned and budget(db, user.id, "reset"):
        raw = secrets.token_urlsafe(32)
        row.reset_hash = mail.digest(raw)
        row.reset_expires = datetime.now(UTC) + timedelta(minutes=30)  # type: ignore[assignment]
        row.password_stamp = mail.digest(str(user.hashed_password))
        cancel(db, user.id, "reset")
        mail.queue(db, user.id, "reset", row.email, "Восстановление пароля VEIN Music",
                   "Вы запросили новый пароль. Ссылка действует 30 минут.\nЕсли это не вы, проигнорируйте письмо.",
                   mail.site_url() + "/email/reset#" + raw)
        db.commit()
    return {"message": "Если почта привязана к аккаунту, мы отправим ссылку восстановления"}


@router.post("/auth/password/reset", responses=ERRORS)
@limiter.limit("5/minute")
def reset(request: Request, data: Reset, db: DB):
    if len(data.password) < 8:
        raise HTTPException(400, "Пароль должен содержать не менее 8 символов")
    row = active_token(db, data.token, "reset")
    user = db.query(User).filter_by(id=row.user_id).with_for_update(of=User).first()
    if not user or user.is_banned or row.password_stamp != mail.digest(str(user.hashed_password)):
        raise HTTPException(400, INVALID_LINK)
    second_factor(db, user, data.otp_code)
    user.hashed_password = get_password_hash(data.password)  # type: ignore[assignment]
    revoke_all_sessions(user)
    row.reset_hash = row.reset_expires = row.password_stamp = None
    cancel(db, row.user_id, "reset")
    db.commit()
    return {"message": "Пароль изменён. Войдите заново на своих устройствах"}


@router.get("/api/admin/email")
def admin_history(response: Response, db: DB, admin: Admin):
    response.headers["Cache-Control"] = "no-store"
    rows = db.query(EmailOutbox, User.username).join(User, User.id == EmailOutbox.user_id).order_by(EmailOutbox.created_at.desc()).limit(50).all()
    return {"configured": mail.configured(), "items": [{"id": r.id, "username": name, "kind": r.kind,
            "status": r.status, "attempts": r.attempts, "created_at": r.created_at, "error_code": r.error_code} for r, name in rows]}


@router.post("/api/admin/email", responses=ERRORS)
@limiter.limit("10/hour")
def admin_message(request: Request, data: Message, db: DB, admin: Admin):
    require_delivery()
    target = db.query(User).filter_by(username=data.username.lower()).first()
    row = db.get(EmailAccount, target.id) if target else None
    if not target or target.is_banned or not row or not row.email or not row.messages_enabled:
        raise HTTPException(400, "Пользователь не разрешил письма или не подтвердил почту")
    if not budget(db, target.id, "message"):
        raise HTTPException(429, "Дневной лимит писем пользователю исчерпан")
    text = data.text + "\n\nОтключить письма от администрации можно в настройках безопасности VEIN Music."
    message = mail.queue(db, target.id, "message", row.email, data.subject, text, mail.site_url() + "/settings?tab=security")
    db.commit()
    return {"message": "Письмо поставлено в очередь", "id": message.id}
