"""TheMealDB-backed recipe selection by mood."""

from __future__ import annotations

import random
from typing import Any

import httpx

BASE = "https://www.themealdb.com/api/json/v1/1"

# Mood slug -> list of (filter_param, value) for filter.php — c=category, a=area
# Each mood uses many buckets so the merged pool is large; meal IDs are deduped in order
# (first-seen wins) so each id appears at most once per mood.
MOOD_FILTERS: dict[str, list[tuple[str, str]]] = {
    "happy": [
        ("c", "Dessert"),
        ("c", "Pasta"),
        ("c", "Starter"),
        ("c", "Side"),
        ("c", "Miscellaneous"),
    ],
    "comfort": [
        ("c", "Beef"),
        ("c", "Chicken"),
        ("c", "Lamb"),
        ("c", "Pork"),
        ("c", "Goat"),
    ],
    "energized": [
        ("c", "Breakfast"),
        ("c", "Seafood"),
        ("c", "Vegetarian"),
        ("c", "Vegan"),
    ],
    "cozy": [
        ("a", "British"),
        ("a", "Irish"),
        ("a", "American"),
        ("a", "Italian"),
        ("a", "Canadian"),
        ("a", "French"),
    ],
    "adventurous": [
        ("a", "Thai"),
        ("a", "Indian"),
        ("a", "Mexican"),
        ("a", "Japanese"),
        ("a", "Chinese"),
        ("a", "Moroccan"),
        ("a", "Spanish"),
        ("a", "Vietnamese"),
        ("a", "Greek"),
        ("a", "Turkish"),
        ("a", "Tunisian"),
        ("a", "Malaysian"),
    ],
    "sweet": [
        ("c", "Dessert"),
    ],
}

BUILTIN_MOODS: list[dict[str, str]] = [
    {"id": "happy", "label": "Happy"},
    {"id": "comfort", "label": "Comfort"},
    {"id": "energized", "label": "Energized"},
    {"id": "cozy", "label": "Cozy"},
    {"id": "adventurous", "label": "Adventurous"},
    {"id": "sweet", "label": "Sweet"},
]

VALID_MOODS = frozenset(MOOD_FILTERS.keys())


async def _fetch_filter_meal_ids(client: httpx.AsyncClient, param: str, value: str) -> list[str]:
    r = await client.get(f"{BASE}/filter.php", params={param: value})
    r.raise_for_status()
    data = r.json()
    meals = data.get("meals") or []
    out: list[str] = []
    for m in meals:
        mid = m.get("idMeal")
        if mid:
            out.append(str(mid))
    return out


async def collect_meal_ids(
    client: httpx.AsyncClient, filters: list[tuple[str, str]]
) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for param, value in filters:
        for mid in await _fetch_filter_meal_ids(client, param, value):
            if mid not in seen:
                seen.add(mid)
                ordered.append(mid)
    return ordered


async def collect_meal_ids_for_mood(client: httpx.AsyncClient, mood: str) -> list[str]:
    filters = MOOD_FILTERS.get(mood)
    if not filters:
        return []
    return await collect_meal_ids(client, filters)


def _meal_to_payload(meal: dict[str, Any]) -> dict[str, Any]:
    ingredients: list[dict[str, str]] = []
    for i in range(1, 21):
        ing = meal.get(f"strIngredient{i}") or ""
        meas = meal.get(f"strMeasure{i}") or ""
        ing = ing.strip()
        if ing:
            ingredients.append({"ingredient": ing, "measure": meas.strip()})

    return {
        "id": meal.get("idMeal"),
        "name": meal.get("strMeal"),
        "category": meal.get("strCategory"),
        "area": meal.get("strArea"),
        "image": meal.get("strMealThumb"),
        "instructions": meal.get("strInstructions"),
        "youtube": meal.get("strYoutube"),
        "source": meal.get("strSource"),
        "ingredients": ingredients,
    }


async def _lookup_meal(client: httpx.AsyncClient, meal_id: str) -> dict[str, Any]:
    r = await client.get(f"{BASE}/lookup.php", params={"i": meal_id})
    r.raise_for_status()
    data = r.json()
    meals = data.get("meals") or []
    if not meals:
        raise ValueError(f"No meal for id {meal_id}")
    return _meal_to_payload(meals[0])


async def _random_meal_any(client: httpx.AsyncClient) -> dict[str, Any]:
    r = await client.get(f"{BASE}/random.php")
    r.raise_for_status()
    data = r.json()
    meals = data.get("meals") or []
    if not meals:
        raise ValueError("random.php returned no meal")
    return _meal_to_payload(meals[0])


async def list_mealdb_filters() -> dict[str, list[str]]:
    """Category and area names from TheMealDB, for custom-mood forms."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        categories_res = await client.get(f"{BASE}/list.php", params={"c": "list"})
        areas_res = await client.get(f"{BASE}/list.php", params={"a": "list"})
        categories_res.raise_for_status()
        areas_res.raise_for_status()

    def names(payload: dict[str, Any], key: str) -> list[str]:
        meals = payload.get("meals") or []
        return sorted({str(m[key]) for m in meals if m.get(key)})

    return {
        "categories": names(categories_res.json(), "strCategory"),
        "areas": names(areas_res.json(), "strArea"),
    }


async def get_recipe_for_mood(
    mood: str,
    exclude_ids: set[str],
    filters: list[tuple[str, str]] | None = None,
) -> dict[str, Any]:
    mood = mood.lower().strip()
    if filters is None:
        if mood not in VALID_MOODS:
            raise ValueError(f"Unknown mood: {mood}")
        chosen_filters = MOOD_FILTERS[mood]
    else:
        chosen_filters = filters
        if not chosen_filters:
            raise ValueError(f"Unknown mood: {mood}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        pool = await collect_meal_ids(client, chosen_filters)
        candidates = [mid for mid in pool if mid not in exclude_ids]

        if candidates:
            chosen = random.choice(candidates)
            return await _lookup_meal(client, chosen)

        if pool:
            # All mood-matched meals were excluded; pick any from pool (same mood)
            chosen = random.choice(pool)
            return await _lookup_meal(client, chosen)

        # No meals from filters (empty category / API); fallback
        return await _random_meal_any(client)
