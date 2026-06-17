/**
 * app/feedback.ts — CF-14
 *
 * Floating feedback button and modal logic.
 * Exports initFeedback() which wires all DOM event listeners.
 *
 * Overlay visibility is controlled via the `hidden` HTML attribute:
 * - removeAttribute("hidden") to show
 * - setAttribute("hidden", "") to hide
 *
 * On successful form submit:
 *   - Hides #feedback-overlay (sets hidden attribute)
 *   - Shows #feedback-confirm (removes hidden attribute)
 */

import { track } from "./analytics";

/**
 * initFeedback(): void
 *
 * Wires the feedback button (#feedback-btn) to open/close the feedback modal
 * (#feedback-overlay). If DOM elements are missing, returns early without throwing.
 */
export function initFeedback(): void {
  const btn = document.getElementById("feedback-btn");
  const overlay = document.getElementById("feedback-overlay");

  if (btn === null || overlay === null) {
    return;
  }

  function openModal(): void {
    if (overlay === null) return;
    overlay.removeAttribute("hidden");
    overlay.setAttribute("aria-hidden", "false");
    track("feedback-opened");
  }

  function closeModal(): void {
    if (overlay === null) return;
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
  }

  // Open modal on button click
  btn.addEventListener("click", () => {
    openModal();
  });

  // Close when clicking the overlay backdrop directly (not a child)
  overlay.addEventListener("click", (event: Event) => {
    const evt = event as Event & { target: EventTarget | null };
    if (evt.target === overlay) {
      closeModal();
    }
  });

  // Wire cancel button if present
  const cancelBtn = document.getElementById("feedback-cancel");
  if (cancelBtn !== null) {
    cancelBtn.addEventListener("click", () => {
      const ta = document.getElementById("feedback-text") as HTMLTextAreaElement | null;
      if (ta !== null) ta.value = "";
      closeModal();
    });
  }

  // Wire alternate close button if present (id: feedback-close-btn)
  const closeBtnEl = document.getElementById("feedback-close-btn");
  if (closeBtnEl !== null) {
    closeBtnEl.addEventListener("click", () => {
      closeModal();
    });
  }

  // Wire form submit event if all required elements are present
  const formEl = document.getElementById("feedback-form");
  const submitBtn = document.getElementById("feedback-submit") as HTMLButtonElement | null;
  const textArea = document.getElementById("feedback-text") as HTMLTextAreaElement | null;
  const confirmEl = document.getElementById("feedback-confirm");

  if (formEl !== null && textArea !== null && confirmEl !== null) {
    formEl.addEventListener("submit", (event: Event) => {
      event.preventDefault();
      const message = textArea.value.trim();
      if (!message) return;

      if (submitBtn !== null) submitBtn.disabled = true;

      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
        .then((response) => {
          if (response.ok) {
            closeModal();
            confirmEl.removeAttribute("hidden");
            track("feedback-submitted");
          } else {
            confirmEl.textContent = "Something went wrong. Please try again.";
            confirmEl.className = "error";
            if (submitBtn !== null) submitBtn.disabled = false;
          }
        })
        .catch(() => {
          confirmEl.textContent = "Could not send. Check your connection.";
          confirmEl.className = "error";
          if (submitBtn !== null) submitBtn.disabled = false;
        });
    });
  }
}
