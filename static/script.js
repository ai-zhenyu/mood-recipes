(function () {
  const STORAGE_KEY = "moodRecipesExcluded";

  /** @type {string | null} */
  let selectedMood = null;
  /** @type {string | null} */
  let selectedMoodLabel = null;
  /** @type {object | null} */
  let currentRecipe = null;
  let loggedIn = false;
  let moodFormReady = false;

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
  const btnSave = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");
  const errorEl = document.getElementById("error");
  const navLogin = document.getElementById("nav-login");
  const navFavorites = document.getElementById("nav-favorites");
  const navLogout = document.getElementById("nav-logout");
  const addMoodSection = document.getElementById("add-mood");
  const addMoodForm = document.getElementById("add-mood-form");
  const moodFormStatus = document.getElementById("mood-form-status");

  const moodButtonClass =
    "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400";

  async function refreshAuthNav() {
    if (!navLogin || !navLogout) return;
    const res = await fetch("/api/me");
    const loggedInNow = res.ok;
    loggedIn = loggedInNow;
    navLogin.classList.toggle("hidden", loggedInNow);
    if (navFavorites) navFavorites.classList.toggle("hidden", !loggedInNow);
    navLogout.classList.toggle("hidden", !loggedInNow);
    if (addMoodSection) addMoodSection.classList.toggle("hidden", !loggedInNow);
    if (loggedInNow) setupMoodForm();
  }

  if (navLogout) {
    navLogout.addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/";
    });
  }

  refreshAuthNav();

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
    currentRecipe = data;
    if (saveStatus) saveStatus.textContent = "";
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

  function selectMood(id, label, button) {
    selectedMood = id;
    selectedMoodLabel = label;
    document.querySelectorAll("#mood-buttons button[data-mood]").forEach((b) => {
      b.classList.remove("ring-2", "ring-orange-500", "bg-orange-100", "border-orange-300");
    });
    button.classList.add("ring-2", "ring-orange-500", "bg-orange-100", "border-orange-300");
    loadRecipe(getExcludedForMood(id));
  }

  function renderMoodButtons(moods) {
    moodButtons.innerHTML = "";
    moods.forEach((m) => {
      const wrap = document.createElement("span");
      wrap.className = "inline-flex items-center";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.mood = m.id;
      btn.textContent = m.label;
      btn.className = moodButtonClass;
      if (m.custom) btn.classList.add("rounded-r-none");
      btn.addEventListener("click", () => selectMood(m.id, m.label, btn));
      if (selectedMood === m.id) {
        btn.classList.add("ring-2", "ring-orange-500", "bg-orange-100", "border-orange-300");
      }
      wrap.appendChild(btn);

      if (m.custom && m.moodId) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${m.label}`);
        remove.className =
          "rounded-r-full border border-l-0 border-slate-200 bg-white px-2 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700";
        remove.addEventListener("click", async () => {
          const res = await fetch(`/api/moods/${m.moodId}`, { method: "DELETE" });
          if (!res.ok) {
            showError("Could not remove that mood.");
            return;
          }
          if (selectedMood === m.id) {
            selectedMood = null;
            selectedMoodLabel = null;
            recipeSection.classList.add("hidden");
          }
          loadMoods();
        });
        wrap.appendChild(remove);
      }

      moodButtons.appendChild(wrap);
    });
  }

  async function loadMoods() {
    const res = await fetch("/api/moods");
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.moods)) {
      showError("Could not load moods.");
      return;
    }
    renderMoodButtons(body.moods);
  }

  function addFilterChoices(container, items, param) {
    container.innerHTML = "";
    items.forEach((value) => {
      const label = document.createElement("label");
      label.className =
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.dataset.param = param;
      input.className = "accent-orange-600";
      label.append(input, document.createTextNode(value));
      container.appendChild(label);
    });
  }

  async function setupMoodForm() {
    if (moodFormReady || !addMoodForm) return;
    moodFormReady = true;
    const res = await fetch("/api/filters");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (moodFormStatus) moodFormStatus.textContent = "Could not load categories.";
      moodFormReady = false;
      return;
    }
    addFilterChoices(document.getElementById("mood-categories"), body.categories || [], "c");
    addFilterChoices(document.getElementById("mood-areas"), body.areas || [], "a");

    const areaSearch = document.getElementById("area-search");
    if (areaSearch) {
      areaSearch.addEventListener("input", () => {
        const query = areaSearch.value.trim().toLowerCase();
        document.querySelectorAll("#mood-areas label").forEach((label) => {
          const matches = !query || label.textContent.toLowerCase().includes(query);
          label.classList.toggle("hidden", !matches);
        });
      });
    }

    addMoodForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (moodFormStatus) moodFormStatus.textContent = "";
      const label = document.getElementById("mood-label").value.trim();
      const filters = [...addMoodForm.querySelectorAll("input[type=checkbox]:checked")].map((input) => ({
        param: input.dataset.param,
        value: input.value,
      }));
      const resCreate = await fetch("/api/moods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, filters }),
      });
      const created = await resCreate.json().catch(() => ({}));
      if (!resCreate.ok) {
        const detail = typeof created.detail === "string" ? created.detail : "Could not add that mood.";
        if (moodFormStatus) moodFormStatus.textContent = detail;
        return;
      }
      addMoodForm.reset();
      if (moodFormStatus) moodFormStatus.textContent = `Added ${created.label}.`;
      loadMoods();
    });
  }

  loadMoods();

  btnAnother.addEventListener("click", () => {
    if (!selectedMood) return;
    const currentId = recipeImage.dataset.mealId;
    if (currentId) addExcluded(selectedMood, currentId);
    loadRecipe(getExcludedForMood(selectedMood));
  });

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      if (!loggedIn) {
        window.location.href = "/login.html";
        return;
      }
      if (!currentRecipe || !selectedMood) return;
      if (saveStatus) saveStatus.textContent = "";
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_id: currentRecipe.id,
          mood: selectedMoodLabel || selectedMood,
          name: currentRecipe.name,
          category: currentRecipe.category,
          area: currentRecipe.area,
          image: currentRecipe.image,
          instructions: currentRecipe.instructions,
          youtube: currentRecipe.youtube,
          ingredients: currentRecipe.ingredients || [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(typeof body.detail === "string" ? body.detail : "Could not save recipe.");
        return;
      }
      clearError();
      if (saveStatus) saveStatus.textContent = "Saved";
    });
  }
})();
