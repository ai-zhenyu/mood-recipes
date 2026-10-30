(function () {
  const listEl = document.getElementById("favorites");
  const emptyEl = document.getElementById("empty");
  const errorEl = document.getElementById("error");
  const logoutBtn = document.getElementById("nav-logout");

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });

  function render(favorites) {
    listEl.innerHTML = "";
    if (!favorites.length) {
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    favorites.forEach((recipe) => {
      const li = document.createElement("li");
      li.className = "overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-lg shadow-orange-900/5";

      const img = document.createElement("img");
      img.src = recipe.image || "";
      img.alt = recipe.name ? `Photo of ${recipe.name}` : "Recipe";
      img.className = "aspect-video w-full object-cover bg-slate-100";

      const body = document.createElement("div");
      body.className = "p-5";

      const mood = document.createElement("p");
      mood.className = "text-xs font-semibold uppercase tracking-wide text-orange-700";
      mood.textContent = recipe.mood || "Mood";

      const title = document.createElement("h2");
      title.className = "font-display mt-1 text-2xl font-semibold text-slate-900";
      title.textContent = recipe.name || "Recipe";

      const meta = document.createElement("p");
      meta.className = "mt-1 text-sm text-slate-500";
      meta.textContent = [recipe.category, recipe.area].filter(Boolean).join(" · ");

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className =
        "mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        const res = await fetch(`/api/favorites/${recipe.id}`, { method: "DELETE" });
        if (!res.ok) {
          showError("Could not remove that recipe.");
          return;
        }
        li.remove();
        if (!listEl.children.length) emptyEl.classList.remove("hidden");
      });

      body.append(mood, title, meta, remove);
      li.append(img, body);
      listEl.appendChild(li);
    });
  }

  async function load() {
    const me = await fetch("/api/me");
    if (!me.ok) {
      window.location.href = "/login.html";
      return;
    }
    const res = await fetch("/api/favorites");
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) {
      showError("Could not load favorites.");
      return;
    }
    render(await res.json());
  }

  load();
})();
