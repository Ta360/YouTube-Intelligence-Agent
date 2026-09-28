try {
  if (localStorage.getItem("yia-theme") === "light") document.documentElement.classList.remove("dark");
} catch (e) {}
