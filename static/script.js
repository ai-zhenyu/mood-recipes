(function () {
  const MOODS = [
    { id: "happy", label: "Happy" },
    { id: "comfort", label: "Comfort" },
    { id: "energized", label: "Energized" },
    { id: "cozy", label: "Cozy" },
    { id: "adventurous", label: "Adventurous" },
    { id: "sweet", label: "Sweet" },
  ];

  const STORAGE_KEY = "moodRecipesExcluded";

  /** @type {string | null} */
  let selectedMood = null;

  const moodButtons = document.getElementById("mood-buttons");
  const recipeSection = document.getElementById("recipe-section");
  const recipeLoading = document.getElementById("recipe-loading");
  const recipeContent = document.getElementById("recipe-content");
  const recipeImage = document.getElementById("recipe-image");
  const recipeTitle = document.getElementById("recipe-title");
  const recipeMeta = document.getElementById("recipe-meta");
  const recipeIngredients = document.getElementById("recipe-ingredients");
  const recipeInstructions = document.getElementById("recipe-instructions");
  const recipeYoutube = document.getElementById("recipe-youtube");
  const btnAnother = document.getElementById("btn-another");
  const errorEl = document.getElementById("error");

  function loadExcluded() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveExcluded(map) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  function getExcludedForMood(mood) {
    const map = loadExcluded();
    const list = map[mood];
    return Array.isArray(list) ? list : [];
  }

  function addExcluded(mood, id) {
    const map = loadExcluded();
    const cur = Array.isArray(map[mood]) ? map[mood] : [];
    if (!cur.includes(id)) cur.push(id);
    map[mood] = cur;
    saveExcluded(map);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  function setLoading(loading) {
    recipeSection.classList.remove("hidden");
    if (loading) {
      recipeLoading.classList.remove("hidden");
      recipeContent.classList.add("hidden");
    } else {
      recipeLoading.classList.add("hidden");
      recipeContent.classList.remove("hidden");
    }
  }

  function renderRecipe(data) {
    if (data.id) recipeImage.dataset.mealId = String(data.id);
    recipeImage.src = data.image || "";
    recipeImage.alt = data.name ? `Photo of ${data.name}` : "Recipe";
    recipeTitle.textContent = data.name || "Recipe";
    const parts = [];
    if (data.category) parts.push(data.category);
    if (data.area) parts.push(data.area);
    recipeMeta.textContent = parts.join(" · ");

    recipeIngredients.innerHTML = "";
    if (Array.isArray(data.ingredients) && data.ingredients.length) {
      const ul = document.createElement("ul");
      ul.className = "list-inside list-disc space-y-1 text-sm text-slate-700";
      data.ingredients.forEach((row) => {
        const li = document.createElement("li");
        const m = row.measure ? `${row.measure} ` : "";
        li.textContent = `${m}${row.ingredient}`.trim();
        ul.appendChild(li);
      });
      const h4 = document.createElement("h4");
      h4.className = "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500";
      h4.textContent = "Ingredients";
      recipeIngredients.appendChild(h4);
      recipeIngredients.appendChild(ul);
    }

    const instr = data.instructions || "";
    recipeInstructions.textContent = instr.trim() || "No instructions listed.";

    if (data.youtube && String(data.youtube).trim()) {
      recipeYoutube.href = data.youtube;
      recipeYoutube.classList.remove("hidden");
    } else {
      recipeYoutube.classList.add("hidden");
    }
  }

  async function fetchRecipe(excludeList) {
    if (!selectedMood) return;
    clearError();
    setLoading(true);

    const params = new URLSearchParams({ mood: selectedMood });
    if (excludeList.length) params.set("exclude", excludeList.join(","));

    const res = await fetch(`/api/recipe?${params.toString()}`);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      let detail = body.detail ?? body.error ?? res.statusText;
      if (typeof detail === "object" && detail !== null) {
        detail = JSON.stringify(detail);
      }
      throw new Error(typeof detail === "string" && detail ? detail : "Could not load recipe.");
    }

    return body;
  }

  async function loadRecipe(excludeList) {
    try {
      const data = await fetchRecipe(excludeList);
      renderRecipe(data);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      recipeContent.classList.add("hidden");
      showError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  MOODS.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.mood = m.id;
    btn.textContent = m.label;
    btn.className =
      "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400";
    btn.addEventListener("click", () => {
      selectedMood = m.id;
      document.querySelectorAll("#mood-buttons button").forEach((b) => {
        b.classList.remove("ring-2", "ring-orange-500", "bg-orange-100", "border-orange-300");
      });
      btn.classList.add("ring-2", "ring-orange-500", "bg-orange-100", "border-orange-300");
      const excluded = getExcludedForMood(m.id);
      loadRecipe(excluded);
    });
    moodButtons.appendChild(btn);
  });

  btnAnother.addEventListener("click", () => {
    if (!selectedMood) return;
    const currentId = recipeImage.dataset.mealId;
    if (currentId) addExcluded(selectedMood, currentId);
    loadRecipe(getExcludedForMood(selectedMood));
  });
})();
