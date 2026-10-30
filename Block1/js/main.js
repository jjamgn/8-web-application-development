const dialogTriggers = document.querySelectorAll("[data-dialog-target]");
const dialogs = document.querySelectorAll(".project-dialog");
const projectToggles = document.querySelectorAll(".project-toggle");
const siteHeader = document.querySelector(".site-header");

let activeTrigger = null;
let savedScrollY = 0;
let savedBodyStyles = null;
let savedScrollBehavior = "";

function updateHeaderOffset() {
  if (!siteHeader) return;
  document.documentElement.style.setProperty(
    "--site-header-height",
    `${siteHeader.getBoundingClientRect().height}px`
  );
}

function lockPageScroll() {
  savedScrollY = window.scrollY;
  savedBodyStyles = {
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    overflow: document.body.style.overflow
  };

  document.body.classList.add("dialog-open");
  document.body.style.top = `-${savedScrollY}px`;
}

function restorePageScroll() {
  if (!savedBodyStyles) return;

  document.body.classList.remove("dialog-open");
  document.body.style.position = savedBodyStyles.position;
  document.body.style.top = savedBodyStyles.top;
  document.body.style.width = savedBodyStyles.width;
  document.body.style.overflow = savedBodyStyles.overflow;

  savedScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  window.scrollTo(0, savedScrollY);
  document.documentElement.style.scrollBehavior = savedScrollBehavior;

  savedBodyStyles = null;
}

function openDialog(trigger) {
  const dialogId = trigger.dataset.dialogTarget;
  const dialog = document.getElementById(dialogId);
  if (!dialog || dialog.open) return;

  activeTrigger = trigger;
  lockPageScroll();
  dialog.showModal();
  dialog.querySelector("[data-dialog-close]").focus();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

dialogTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => openDialog(trigger));
});

dialogs.forEach((dialog) => {
  dialog.querySelector("[data-dialog-close]").addEventListener("click", () => {
    closeDialog(dialog);
  });

  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;

    const bounds = dialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) closeDialog(dialog);
  });

  dialog.addEventListener("close", () => {
    restorePageScroll();
    if (activeTrigger) activeTrigger.focus({ preventScroll: true });
    activeTrigger = null;
  });
});

projectToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    const details = document.getElementById(toggle.getAttribute("aria-controls"));
    const indicator = toggle.querySelector(".project-toggle__indicator");

    toggle.setAttribute("aria-expanded", String(!isExpanded));
    details.hidden = isExpanded;
    indicator.textContent = isExpanded ? "+" : "−";
  });
});

updateHeaderOffset();
window.addEventListener("resize", updateHeaderOffset);
