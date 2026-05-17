(function () {
  "use strict";

  function safeString(value) {
    return String(value || "").trim();
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || `Request failed with status ${response.status}.`);
    }
    return payload;
  }

  function populateSelect(selectElement, studies, currentStudyId, emptyLabel) {
    if (!selectElement) {
      return;
    }
    const selectedId = safeString(currentStudyId);
    const previousValue = safeString(selectElement.value);
    const nextValue = selectedId || previousValue;
    selectElement.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = emptyLabel || "No study selected";
    selectElement.appendChild(emptyOption);

    (Array.isArray(studies) ? studies : []).forEach((study) => {
      const option = document.createElement("option");
      option.value = safeString(study.id);
      option.textContent = safeString(study.label) || safeString(study.id);
      if (safeString(study.id) === nextValue) {
        option.selected = true;
      }
      selectElement.appendChild(option);
    });
    if (!nextValue) {
      selectElement.value = "";
    }
  }

  function findStudy(payload, studyId) {
    const targetId = safeString(studyId);
    return (payload?.studies || []).find((study) => safeString(study.id) === targetId) || null;
  }

  window.HAGRadExportStudies = {
    fetchJson,
    safeString,
    load() {
      return fetchJson("/api/export-studies");
    },
    create(label) {
      return fetchJson("/api/export-studies/create", {
        method: "POST",
        body: JSON.stringify({ label: safeString(label) }),
      });
    },
    select(studyId) {
      return fetchJson("/api/export-studies/select", {
        method: "POST",
        body: JSON.stringify({ studyId: safeString(studyId) }),
      });
    },
    populateSelect,
    findStudy,
  };
})();
