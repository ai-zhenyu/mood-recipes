(function () {
  function showFormError(message) {
    const el = document.getElementById("form-error");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function clearFormError() {
    const el = document.getElementById("form-error");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let detail = data.detail || "Something went wrong.";
      if (typeof detail !== "string") detail = "Something went wrong.";
      throw new Error(detail);
    }
    return data;
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormError();
      const remember = document.getElementById("remember");
      try {
        await postJson("/api/login", {
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
          remember: Boolean(remember && remember.checked),
        });
        window.location.href = "/";
      } catch (err) {
        showFormError(err instanceof Error ? err.message : "Could not log in.");
      }
    });
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormError();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirm-password").value;
      if (password !== confirm) {
        showFormError("Passwords do not match.");
        return;
      }
      try {
        await postJson("/api/register", {
          email: document.getElementById("email").value,
          password,
        });
        window.location.href = "/";
      } catch (err) {
        showFormError(err instanceof Error ? err.message : "Could not register.");
      }
    });
  }

  const forgotForm = document.getElementById("forgot-form");
  if (forgotForm) {
    const emailStep = document.getElementById("email-step");
    const passwordStep = document.getElementById("password-step");
    const continueBtn = document.getElementById("btn-continue");
    const successEl = document.getElementById("form-success");

    function showPasswordStep() {
      clearFormError();
      const email = document.getElementById("email").value.trim();
      if (!email) {
        showFormError("Enter a valid email.");
        return;
      }
      emailStep.classList.add("hidden");
      passwordStep.classList.remove("hidden");
    }

    continueBtn.addEventListener("click", showPasswordStep);

    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (passwordStep.classList.contains("hidden")) {
        showPasswordStep();
        return;
      }
      clearFormError();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirm-password").value;
      if (password !== confirm) {
        showFormError("Passwords do not match.");
        return;
      }
      try {
        const data = await postJson("/api/forgot-password", {
          email: document.getElementById("email").value,
          new_password: password,
        });
        passwordStep.classList.add("hidden");
        successEl.textContent = data.detail || "If an account exists for that email, the password has been updated.";
        successEl.classList.remove("hidden");
      } catch (err) {
        showFormError(err instanceof Error ? err.message : "Could not reset password.");
      }
    });
  }
})();
