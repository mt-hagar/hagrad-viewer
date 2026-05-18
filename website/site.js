(function () {
  "use strict";

  const DOWNLOADS = {
    macos: {
      url: "https://github.com/mt-hagar/hagrad-viewer/releases/download/v0.9.0-research-preview/HAGRad-Viewer-macOS.zip",
      directAsset: "HAGRad-Viewer-macOS.zip",
      label: "Download for macOS",
    },
    windows: {
      url: "https://github.com/mt-hagar/hagrad-viewer/releases/download/v0.9.0-research-preview/HAGRad-Viewer-Windows.zip",
      directAsset: "HAGRad-Viewer-Windows.zip",
      label: "Download for Windows",
    },
    github: {
      url: "https://github.com/mt-hagar/hagrad-viewer/releases/latest",
      label: "View GitHub releases",
    },
  };

  function applyDownloadLinks() {
    document.querySelectorAll("[data-download]").forEach((link) => {
      const key = link.getAttribute("data-download");
      const target = DOWNLOADS[key];
      if (!target) {
        return;
      }
      link.href = target.url;
      link.textContent = target.label;
      if (target.directAsset) {
        link.setAttribute("title", `Download ${target.directAsset} from the latest GitHub release.`);
      }
      link.setAttribute("rel", "noopener noreferrer");
    });
  }

  function applyCurrentYear() {
    const year = document.getElementById("current-year");
    if (year) {
      year.textContent = String(new Date().getFullYear());
    }
  }

  applyDownloadLinks();
  applyCurrentYear();
})();
