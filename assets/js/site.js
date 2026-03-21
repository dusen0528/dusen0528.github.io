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

const getSeoulDateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const setupVisitorCounts = async () => {
  const todayNode = document.querySelector("[data-visitor-today]");
  const totalNode = document.querySelector("[data-visitor-total]");
  if (!todayNode || !totalNode) return;

  const hostname = window.location.hostname;
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    todayNode.textContent = "-";
    totalNode.textContent = "-";
    return;
  }

  const namespace = "dusen0528-portfolio";
  const dateKey = getSeoulDateKey();
  const cacheKey = `visitor-counts:${dateKey}`;

  const renderCounts = ({ today, total }) => {
    todayNode.textContent = String(today);
    totalNode.textContent = String(total);
  };

  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      renderCounts(JSON.parse(cached));
      return;
    }

    const [todayResponse, totalResponse] = await Promise.all([
      fetch(`https://api.countapi.xyz/hit/${namespace}/today-${dateKey}`),
      fetch(`https://api.countapi.xyz/hit/${namespace}/total`),
    ]);

    const [todayData, totalData] = await Promise.all([
      todayResponse.json(),
      totalResponse.json(),
    ]);

    const counts = {
      today: todayData.value ?? "-",
      total: totalData.value ?? "-",
    };

    sessionStorage.setItem(cacheKey, JSON.stringify(counts));
    renderCounts(counts);
  } catch (error) {
    console.error(error);
    todayNode.textContent = "-";
    totalNode.textContent = "-";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  revealElements();
  bindMobileNavClose();
  setCurrentYear();
  setupVisitorCounts();
});
