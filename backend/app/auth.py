"""One local account, salted password hashes and revocable opaque sessions."""
import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .db import DATA_DIR

AUTH_PATH = DATA_DIR / "account.db"
GUEST_MODE = os.environ.get("GUEST_LOGIN", "0") == "1"
COOKIE = os.environ.get("SESSION_COOKIE", "keeps_session")
SESSION_SECONDS = 30 * 24 * 3600
router = APIRouter(prefix="/api/auth", tags=["account"])


@contextmanager
def connection():
    db = sqlite3.connect(AUTH_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize():
    with connection() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS account (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                username TEXT NOT NULL, password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, expires REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT, at REAL);
        ''')
        if GUEST_MODE:
            db.execute("INSERT OR IGNORE INTO account VALUES (1, ?, ?)", ("guest", hash_password(secrets.token_urlsafe(32))))
    AUTH_PATH.chmod(0o600)


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000).hex()
    return "pbkdf2_sha256:600000:" + salt + ":" + digest


def matches(password, stored):
    return hmac.compare_digest(hash_password(password, stored.split(":")[2]), stored)


def session_hash(request):
    return hashlib.sha256(request.cookies.get(COOKIE, "").encode()).hexdigest()


def account_state(request):
    with connection() as db:
        account = db.execute("SELECT username FROM account WHERE id=1").fetchone()
        session = db.execute("SELECT 1 FROM sessions WHERE token_hash=? AND expires>?", (session_hash(request), time.time())).fetchone()
    return {"initialized": bool(account), "authenticated": bool(account and session),
            "username": account["username"] if account and session else None, "guest_mode": GUEST_MODE}


async def guard(request, call_next):
    path = request.url.path
    private = path.startswith("/api/") or path == "/media" or path.startswith("/media/")
    if private:
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if request.headers.get("x-keeps-request") != "1" or (origin and urlsplit(origin).netloc != request.url.netloc):
                return JSONResponse({"detail": "请求来源无效，请刷新页面后重试"}, status_code=403)
        public = path in ("/api/health", "/api/auth/status", "/api/auth/setup", "/api/auth/login")
        if not public and not account_state(request)["authenticated"]:
            return JSONResponse({"detail": "请先登录"}, status_code=401, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    if private:
        # Keep image bytes locally, but validate both the session and file before
        # reuse. StaticFiles handles ETag/Last-Modified and body-free 304 replies.
        cacheable_image = (request.method in ("GET", "HEAD")
                           and path.startswith("/media/") and path.endswith("/display.png")
                           and response.status_code in (200, 304))
        response.headers["Cache-Control"] = "private, no-cache" if cacheable_image else "no-store"
        if cacheable_image:
            response.headers.append("Vary", "Cookie")
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=10, max_length=128)


class LoginCredentials(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(default="", max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


def issue_session(db, request, response):
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
    db.execute("INSERT INTO sessions VALUES (?, ?)", (hashlib.sha256(token.encode()).hexdigest(), time.time() + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=request.url.scheme == "https", samesite="strict", path="/")


def throttle(request):
    ip = request.client.host if request.client else "unknown"
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM login_attempts WHERE at<?", (time.time() - 900,))
        count = db.execute("SELECT count(*) FROM login_attempts WHERE ip=?", (ip,)).fetchone()[0]
        if count >= 10:
            raise HTTPException(429, "尝试次数过多，请 15 分钟后重试")
        db.execute("INSERT INTO login_attempts VALUES (?, ?)", (ip, time.time()))


@router.get("/status")
def status(request: Request):
    return account_state(request)


@router.post("/setup", status_code=201)
def setup(payload: Credentials, request: Request, response: Response):
    if GUEST_MODE:
        raise HTTPException(403, "访客体验无需设置账号")
    name = payload.username.strip()
    if not name:
        raise HTTPException(422, "请填写账号名称")
    password_hash = hash_password(payload.password)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM account").fetchone():
            raise HTTPException(409, "账号已经设置，请登录")
        db.execute("INSERT INTO account VALUES (1, ?, ?)", (name, password_hash))
        issue_session(db, request, response)
    return {"username": name}


@router.post("/login")
def login(payload: LoginCredentials, request: Request, response: Response):
    throttle(request)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        account = db.execute("SELECT * FROM account WHERE id=1").fetchone()
        if GUEST_MODE:
            valid_password = bool(account and account["username"] == "guest" and payload.username.strip() == "guest")
        else:
            # Do equivalent password work even for an unknown account name.
            valid_password = matches(payload.password, account["password_hash"]) if account else matches(payload.password, hash_password("uninitialized-account"))
        if not account or not valid_password or not hmac.compare_digest(payload.username.strip().encode(), account["username"].encode()):
            raise HTTPException(401, "账号或密码不正确")
        issue_session(db, request, response)
        db.execute("DELETE FROM login_attempts WHERE ip=?", (request.client.host if request.client else "unknown",))
    return {"username": account["username"]}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    with connection() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (session_hash(request),))
    response.delete_cookie(COOKIE, path="/")


@router.post("/password", status_code=204)
def change_password(payload: PasswordChange, request: Request, response: Response):
    if GUEST_MODE:
        raise HTTPException(403, "访客体验不支持修改密码")
    throttle(request)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        account = db.execute("SELECT * FROM account WHERE id=1").fetchone()
        if not account or not matches(payload.current_password, account["password_hash"]):
            raise HTTPException(400, "当前密码不正确")
        if payload.current_password == payload.new_password:
            raise HTTPException(400, "新密码不能与当前密码相同")
        db.execute("UPDATE account SET password_hash=? WHERE id=1", (hash_password(payload.new_password),))
        db.execute("DELETE FROM sessions")
        db.execute("DELETE FROM login_attempts WHERE ip=?", (request.client.host if request.client else "unknown",))
    response.delete_cookie(COOKIE, path="/")
