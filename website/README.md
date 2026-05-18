# HAGRad Website

This folder contains the static public website for HAGRad.

It is intentionally separate from the local DICOM viewer apps. The website should explain the project,
show the workflows, and route users to local downloads. It should not accept patient DICOM uploads unless
a separate secure medical-data infrastructure is deliberately built later.

## Local preview

From the repository root:

```bash
python3 -m http.server 8088
```

Then open:

```text
http://localhost:8088/website/
```

## Deployment options

Good first choices:

- GitHub Pages, if the public repository is `mt-hagar/hagrad-viewer`.
- Netlify or Vercel, if you want a very simple custom-domain setup.
- A conventional webhost, if you prefer to manage `hagrad.org` manually.

## Download links

The macOS and Windows buttons are controlled in `site.js`.

Current behavior:

- `Download for macOS` downloads the latest `HAGRad-Viewer-macOS.zip` release asset.
- `Download for Windows` downloads the latest `HAGRad-Viewer-Windows.zip` release asset.
- `View GitHub releases` opens the release archive.

The platform-specific download URLs use the current research-preview release asset route:

```text
https://github.com/mt-hagar/hagrad-viewer/releases/download/v0.9.0-research-preview/HAGRad-Viewer-macOS.zip
https://github.com/mt-hagar/hagrad-viewer/releases/download/v0.9.0-research-preview/HAGRad-Viewer-Windows.zip
```

## Custom domain

If you purchase `hagrad.org`, point the domain DNS to the chosen hosting provider.

For GitHub Pages, add a `CNAME` file containing:

```text
hagrad.org
```

Only add that file once the domain is actually configured.

## Safety positioning

Keep the research-use-only disclaimer visible on the homepage and in every release package:

```text
Research use only. Not for clinical diagnosis or patient care.
```
