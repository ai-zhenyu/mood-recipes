"""Password hashing and session cookies."""

from __future__ import annotations

import json
from base64 import b64decode, b64encode

import bcrypt
from fastapi import HTTPException, Request
from itsdangerous.exc import BadSignature
from sqlalchemy.orm import Session as DbSession
from starlette.datastructures import MutableHeaders
from starlette.middleware.sessions import Session as CookieSession
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import HTTPConnection
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from database import User

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 72
REMEMBER_MAX_AGE = 30 * 24 * 60 * 60


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def normalize_email(email: str) -> str:
    cleaned = email.strip().lower()
    local, sep, domain = cleaned.partition("@")
    if not sep or not local or "." not in domain or len(cleaned) > 255:
        raise HTTPException(status_code=400, detail="Enter a valid email.")
    return cleaned


def check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )
    if len(password.encode("utf-8")) > MAX_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail="Password is too long.")


def current_user(request: Request, db: DbSession) -> User | None:
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    return db.get(User, int(user_id))


def require_user(request: Request, db: DbSession) -> User:
    user = current_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Log in required.")
    return user


class RememberSessionMiddleware(SessionMiddleware):
    """Session cookie by default; a 30-day cookie when session['remember'] is set."""

    def __init__(self, app: ASGIApp, secret_key: str) -> None:
        super().__init__(app, secret_key, max_age=REMEMBER_MAX_AGE, same_site="lax", https_only=False)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        connection = HTTPConnection(scope)
        initial_session_was_empty = True

        if self.session_cookie in connection.cookies:
            data = connection.cookies[self.session_cookie].encode("utf-8")
            try:
                data = self.signer.unsign(data, max_age=self.max_age)
                scope["session"] = CookieSession(json.loads(b64decode(data)))
                initial_session_was_empty = False
            except BadSignature:
                scope["session"] = CookieSession()
        else:
            scope["session"] = CookieSession()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                session: CookieSession = scope["session"]
                message.setdefault("headers", [])
                headers = MutableHeaders(scope=message)
                if session.accessed:
                    headers.add_vary_header("Cookie")
                if session.modified and session:
                    data = b64encode(json.dumps(session).encode("utf-8"))
                    data = self.signer.sign(data)
                    remember = bool(session.get("remember"))
                    max_age = f"Max-Age={self.max_age}; " if remember else ""
                    header_value = "{session_cookie}={data}; path={path}; {max_age}{security_flags}".format(
                        session_cookie=self.session_cookie,
                        data=data.decode("utf-8"),
                        path=self.path,
                        max_age=max_age,
                        security_flags=self.security_flags,
                    )
                    headers.append("Set-Cookie", header_value)
                elif session.modified and not initial_session_was_empty:
                    header_value = "{session_cookie}={data}; path={path}; {expires}{security_flags}".format(
                        session_cookie=self.session_cookie,
                        data="null",
                        path=self.path,
                        expires="expires=Thu, 01 Jan 1970 00:00:00 GMT; ",
                        security_flags=self.security_flags,
                    )
                    headers.append("Set-Cookie", header_value)
            await send(message)

        await self.app(scope, receive, send_wrapper)
