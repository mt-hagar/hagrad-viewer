(function () {
  "use strict";

  const WORKFLOW_LABELS = new Map([
    ["/src/viewer.html", "HAGRad Viewer"],
    ["/src/ccta-iq/index.html", "HAGRad Image Quality"],
    ["/src/noisepower/index.html", "HAGRad Noise Power"],
    ["/src/eat.html", "HAGRad EAT"],
    ["/src/qca/index.html", "HAGRad QCA"],
  ]);

  let dialog = null;
  let pendingHref = "";
  let lastFocusedElement = null;

  function normalizeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function getPathname(value) {
    try {
      return new URL(value, window.location.href).pathname;
    } catch {
      return "";
    }
  }

  function isSameDestination(anchor) {
    return normalizeUrl(anchor.href) === normalizeUrl(window.location.href);
  }

  function getTargetLabel(href) {
    return WORKFLOW_LABELS.get(getPathname(href)) || "another workflow";
  }

  function textHasLoadedStudy(text) {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    const loadedMatch = normalized.match(/\b(\d+)\s+loaded\b/);
    if (loadedMatch && Number(loadedMatch[1]) > 0) {
      return true;
    }
    const countMatch = normalized.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    return Boolean(countMatch && Number(countMatch[2]) > 0);
  }

  function defaultHasOpenStudy() {
    const stateApi = window.HAGRadWorkflowGuardState;
    if (stateApi && typeof stateApi.hasOpenStudy === "function") {
      try {
        return Boolean(stateApi.hasOpenStudy());
      } catch {
        return false;
      }
    }

    const candidateIds = [
      "reconstruction-summary",
      "series-summary",
      "slice-readout",
      "frame-readout",
      "preview-frame-readout",
      "analysis-frame-readout",
    ];
    return candidateIds.some((id) => textHasLoadedStudy(document.getElementById(id)?.textContent));
  }

  function makeDialog() {
    if (dialog) {
      return dialog;
    }

    const backdrop = document.createElement("div");
    backdrop.className = "workflow-switch-guard-backdrop is-hidden";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.innerHTML = `
      <section class="workflow-switch-guard-dialog" role="dialog" aria-modal="true" aria-labelledby="workflow-switch-guard-title">
        <div>
          <p class="workflow-switch-guard-kicker">Workflow Change</p>
          <h2 class="workflow-switch-guard-title" id="workflow-switch-guard-title">Change workflow?</h2>
        </div>
        <p class="workflow-switch-guard-copy" id="workflow-switch-guard-copy"></p>
        <div class="workflow-switch-guard-actions">
          <button class="button secondary" type="button" data-workflow-switch-cancel>Cancel and Remain</button>
          <button class="button primary" type="button" data-workflow-switch-confirm>Continue Anyway</button>
        </div>
      </section>
    `;
    document.body.appendChild(backdrop);

    const copy = backdrop.querySelector("#workflow-switch-guard-copy");
    const confirmButton = backdrop.querySelector("[data-workflow-switch-confirm]");
    const cancelButton = backdrop.querySelector("[data-workflow-switch-cancel]");

    function close() {
      backdrop.classList.add("is-hidden");
      backdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-workflow-switch-guard-open");
      pendingHref = "";
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus({ preventScroll: true });
      }
    }

    function markConfirmedWorkflowSwitch() {
      const stateApi = window.HAGRadWorkflowGuardState;
      if (stateApi && typeof stateApi.allowWorkflowSwitch === "function") {
        try {
          stateApi.allowWorkflowSwitch();
        } catch {
          // The navigation is already user-confirmed; do not let a guard API error trap the user.
        }
      }
      window.HAGRadWorkflowSwitchGuardConfirmed = true;
    }

    confirmButton.addEventListener("click", () => {
      const href = pendingHref;
      close();
      if (href) {
        markConfirmedWorkflowSwitch();
        window.location.href = href;
      }
    });

    cancelButton.addEventListener("click", close);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (backdrop.classList.contains("is-hidden")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    dialog = {
      open(href) {
        pendingHref = href;
        const targetLabel = getTargetLabel(href);
        copy.textContent = `Switching to ${targetLabel} will clear the currently loaded patient/study and any unsaved measurements in this workflow. Measurements stay isolated by workflow, so they will not be mixed into the next workspace.`;
        lastFocusedElement = document.activeElement;
        backdrop.classList.remove("is-hidden");
        backdrop.setAttribute("aria-hidden", "false");
        document.body.classList.add("is-workflow-switch-guard-open");
        cancelButton.focus({ preventScroll: true });
      },
    };

    return dialog;
  }

  function handleWorkflowClick(event) {
    const anchor = event.target?.closest?.(".hero-workflow-switcher a[href]");
    if (!anchor || event.defaultPrevented || event.button !== 0) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target) {
      return;
    }
    if (isSameDestination(anchor)) {
      event.preventDefault();
      return;
    }
    if (!defaultHasOpenStudy()) {
      return;
    }

    event.preventDefault();
    makeDialog().open(anchor.href);
  }

  document.addEventListener("click", handleWorkflowClick);
})();
