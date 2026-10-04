(() => {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const healthOutput = document.getElementById("health-output");
  const deployStatus = document.getElementById("deploy-status");

  const engines = {
    google: "https://www.google.com/search?q=",
    bing: "https://www.bing.com/search?q=",
    duckduckgo: "https://duckduckgo.com/?q="
  };

  let activeEngine = window.APP_CONFIG?.defaultEngine || "google";

  document.querySelectorAll(".engine").forEach((button) => {
    button.addEventListener("click", () => {
      activeEngine = button.dataset.engine;
      document.querySelectorAll(".engine").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      input.focus();
    });
  });

  function looksLikeUrl(value) {
    return /^https?:\/\//i.test(value) ||
      /^[\\w-]+(\\.[\\w-]+)+([/:?#].*)?$/i.test(value);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;

    if (looksLikeUrl(value)) {
      const target = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      location.href = target;
      return;
    }

    const base = engines[activeEngine] || engines.google;
    location.href = base + encodeURIComponent(value);
  });

  fetch("/.netlify/functions/health", { cache: "no-store" })
    .then(async (response) => {
      const data = await response.json();
      deployStatus.textContent = "Online";
      healthOutput.textContent = JSON.stringify(data, null, 2);
    })
    .catch((error) => {
      deployStatus.textContent = "Static UI online";
      healthOutput.textContent = "Static hosting is working. Netlify health function is only available if you deploy this folder to Netlify.";
    });
})();