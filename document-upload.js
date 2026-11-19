"use strict";

const mobileMenuButton = document.getElementById("mobileMenuBtn");
const mainNavigation = document.getElementById("mainNav");

mobileMenuButton.addEventListener("click", () => {
  const isOpen = mobileMenuButton.getAttribute("aria-expanded") !== "true";
  mobileMenuButton.setAttribute("aria-expanded", String(isOpen));
  mobileMenuButton.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  mainNavigation.classList.toggle("open", isOpen);
});

mainNavigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute("aria-label", "Open navigation");
    mainNavigation.classList.remove("open");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute("aria-label", "Open navigation");
    mainNavigation.classList.remove("open");
  }
});
