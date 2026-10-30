"""Mood-based recipe app: static UI, auth, and /api/recipe proxy to TheMealDB."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth import (
    RememberSessionMiddleware,
    check_password,
    current_user,
    hash_password,
    normalize_email,
    require_user,
    verify_password,
)
from database import Favorite, User, get_db, init_db
from recipe_service import VALID_MOODS, get_recipe_for_mood

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SESSION_SECRET = os.environ.get("SESSION_SECRET") or "dev-only-mood-recipe-secret"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Mood Recipes", lifespan=lifespan)
app.add_middleware(RememberSessionMiddleware, secret_key=SESSION_SECRET)


class RegisterBody(BaseModel):
    email: str
    password: str


class LoginBody(BaseModel):
    email: str
    password: str
    remember: bool = False


class ForgotBody(BaseModel):
    email: str
    new_password: str


class IngredientIn(BaseModel):
    ingredient: str
    measure: str = ""


class FavoriteIn(BaseModel):
    meal_id: str
    mood: str
    name: str
    category: str | None = None
    area: str | None = None
    image: str | None = None
    instructions: str | None = None
    youtube: str | None = None
    ingredients: list[IngredientIn] = []


def _favorite_payload(row: Favorite) -> dict:
    try:
        ingredients = json.loads(row.ingredients_json or "[]")
    except json.JSONDecodeError:
        ingredients = []
    return {
        "id": row.id,
        "meal_id": row.meal_id,
        "mood": row.mood,
        "name": row.name,
        "category": row.category,
        "area": row.area,
        "image": row.image,
        "instructions": row.instructions,
        "youtube": row.youtube,
        "ingredients": ingredients,
    }


def _login(request: Request, user: User, remember: bool) -> dict[str, str]:
    request.session["user_id"] = user.id
    request.session["remember"] = remember
    return {"email": user.email}


@app.post("/api/register")
def api_register(body: RegisterBody, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(body.email)
    check_password(body.password)
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with that email already exists.")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _login(request, user, remember=False)


@app.post("/api/login")
def api_login(body: LoginBody, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(body.email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _login(request, user, body.remember)


@app.post("/api/logout")
def api_logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.post("/api/forgot-password")
def api_forgot_password(body: ForgotBody, db: Session = Depends(get_db)):
    email = normalize_email(body.email)
    check_password(body.new_password)
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        user.password_hash = hash_password(body.new_password)
        db.commit()
    return {"detail": "If an account exists for that email, the password has been updated."}


@app.get("/api/me")
def api_me(request: Request, db: Session = Depends(get_db)):
    user = current_user(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Log in required.")
    return {"email": user.email}


@app.post("/api/favorites")
def api_save_favorite(body: FavoriteIn, request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    meal_id = body.meal_id.strip()
    mood = body.mood.strip()
    name = body.name.strip()
    if not meal_id or not mood or not name:
        raise HTTPException(status_code=400, detail="Recipe, mood, and name are required.")
    existing = db.scalar(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.meal_id == meal_id,
            Favorite.mood == mood,
        )
    )
    if existing is not None:
        return _favorite_payload(existing)
    row = Favorite(
        user_id=user.id,
        meal_id=meal_id,
        mood=mood[:80],
        name=name[:255],
        category=(body.category or None),
        area=(body.area or None),
        image=(body.image or None),
        instructions=body.instructions,
        youtube=(body.youtube or None),
        ingredients_json=json.dumps([item.model_dump() for item in body.ingredients]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _favorite_payload(row)


@app.get("/api/favorites")
def api_list_favorites(request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    rows = db.scalars(
        select(Favorite).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())
    ).all()
    return [_favorite_payload(row) for row in rows]


@app.delete("/api/favorites/{favorite_id}")
def api_delete_favorite(favorite_id: int, request: Request, db: Session = Depends(get_db)):
    user = require_user(request, db)
    row = db.get(Favorite, favorite_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Favorite not found.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/recipe")
async def api_recipe(
    mood: str = Query(..., description="Mood slug: happy, comfort, energized, cozy, adventurous, sweet"),
    exclude: str | None = Query(None, description="Comma-separated meal ids to avoid"),
):
    exclude_ids: set[str] = set()
    if exclude:
        exclude_ids = {x.strip() for x in exclude.split(",") if x.strip()}

    mood_key = mood.lower().strip()
    if mood_key not in VALID_MOODS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mood. Valid: {', '.join(sorted(VALID_MOODS))}",
        )

    try:
        recipe = await get_recipe_for_mood(mood_key, exclude_ids)
    except Exception as e:
        return JSONResponse(
            status_code=502,
            content={"detail": "Recipe service unavailable.", "error": str(e)},
        )

    return recipe


app.mount(
    "/",
    StaticFiles(directory=str(STATIC_DIR), html=True),
    name="static",
)
