document.addEventListener("DOMContentLoaded", () => {
  const blogRoot = document.getElementById("blogIndex");
  if (!blogRoot) return;

  const searchInput = document.getElementById("searchPosts");
  const filterButtons = Array.from(
    document.querySelectorAll("#categoryFilters [data-category]"),
  );
  const items = Array.from(document.querySelectorAll(".js-post-item"));
  const emptyState = document.getElementById("emptyState");
  const pagination = document.getElementById("postPagination");
  const pageSize = 6;

  let activeCategory = "All";
  let currentPage = 1;

  const getFilteredItems = () => {
    const query = (searchInput?.value || "").trim().toLowerCase();

    return items.filter((item) => {
      const card = item.querySelector(".js-post-card");
      if (!card) return false;

      const category = card.dataset.category || "";
      const haystack = card.dataset.search || "";
      const categoryMatch =
        activeCategory === "All" || category === activeCategory;
      const queryMatch = !query || haystack.includes(query);
      return categoryMatch && queryMatch;
    });
  };

  const renderPagination = (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    pagination.innerHTML = "";

    if (totalItems <= pageSize) {
      pagination.classList.add("d-none");
      return;
    }

    pagination.classList.remove("d-none");

    const fragment = document.createDocumentFragment();

    const createButton = (label, page, isActive = false, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `pagination-button${isActive ? " active" : ""}`;
      button.textContent = label;
      button.disabled = disabled;
      button.dataset.page = String(page);
      fragment.appendChild(button);
    };

    createButton("이전", currentPage - 1, false, currentPage === 1);

    for (let page = 1; page <= totalPages; page += 1) {
      createButton(String(page), page, page === currentPage, false);
    }

    createButton("다음", currentPage + 1, false, currentPage === totalPages);

    pagination.appendChild(fragment);
  };

  const applyFilters = () => {
    const filteredItems = getFilteredItems();
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;

    items.forEach((item) => {
      item.classList.add("d-none");
    });

    filteredItems.slice(start, end).forEach((item) => {
      item.classList.remove("d-none");
    });

    emptyState.classList.toggle("d-none", filteredItems.length > 0);
    renderPagination(filteredItems.length);
  };

  searchInput?.addEventListener("input", () => {
    currentPage = 1;
    applyFilters();
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category || "All";
      currentPage = 1;
      filterButtons.forEach((node) =>
        node.classList.toggle("active", node === button),
      );
      applyFilters();
    });
  });

  pagination?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-page]");
    if (!target || target.disabled) return;
    currentPage = Number(target.dataset.page || "1");
    applyFilters();
  });

  applyFilters();
});
