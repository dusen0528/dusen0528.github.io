const revealElements = () => {
  const nodes = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -24px 0px",
    },
  );

  nodes.forEach((node) => observer.observe(node));
};

const bindMobileNavClose = () => {
  const nav = document.querySelector(".navbar-collapse");
  if (!nav || typeof bootstrap === "undefined") return;

  const collapse = bootstrap.Collapse.getOrCreateInstance(nav, { toggle: false });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth < 992) {
        collapse.hide();
      }
    });
  });
};

const setCurrentYear = () => {
  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });
};

document.addEventListener("DOMContentLoaded", () => {
  revealElements();
  bindMobileNavClose();
  setCurrentYear();
});
