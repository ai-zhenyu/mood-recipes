"""Mood-based recipe app: static UI + /api/recipe proxy to TheMealDB."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from recipe_service import VALID_MOODS, get_recipe_for_mood

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Mood Recipes")


@app.get("/api/recipe")
async def api_recipe(
    mood: str = Query(..., description="Mood slug: happy, comfort, energized, cozy, adventurous"),
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
