# HAGRad Manuscript Outline

## Working title options

1. `HAGRad: A Modular Research Platform for Cardiovascular Image Analysis, Visualization, and Quantitative Workflow Development`
2. `HAGRad Viewer and Workflow Extensions for Cardiovascular Imaging Research`
3. `HAGRad: A Local Scientific Workstation for Cardiac CT and Angiographic Image Analysis`

## Recommended paper type

- technical note
- methods paper
- software paper
- imaging informatics manuscript

## Core message

HAGRad is a modular, locally hosted scientific imaging platform that supports cardiovascular image review, multi-planar reformations, quantitative analysis, and export workflows across multiple research applications.

## Suggested abstract draft

### Background
`Cardiovascular imaging research often requires flexible quantitative workflows that are not easily supported by standard presentation software or by vendor-specific clinical platforms.`

### Purpose
`To develop and describe HAGRad, a modular local software platform for cardiovascular image analysis, visualization, quantitative workflow prototyping, and structured export in research settings.`

### Methods
`HAGRad was implemented as a locally hosted browser-based platform with dedicated workflows for general cardiac CT review, epicardial adipose tissue analysis, coronary assessment, invasive angiographic quantitative coronary analysis prototyping, stent-focused image analysis, and coronary calcium scoring. The platform supports image navigation, multi-planar reformation, measurement and annotation tools, structured CSV/PNG export, and workflow-specific quantitative modules.`

### Results
`The platform enables reproducible local review and export of cardiovascular imaging measurements, supports per-workflow customization, and provides a unified environment for generating quantitative outputs suitable for scientific analysis and presentation.`

### Conclusion
`HAGRad provides a flexible non-commercial research framework for cardiovascular imaging workflows and may facilitate rapid development, evaluation, and dissemination of imaging analysis methods.`

## Full paper structure

## 1. Introduction

Points to cover:

- cardiovascular imaging research often needs flexible software tools
- vendor platforms can be powerful but closed and workflow-specific
- presentation tools are not quantitative workstations
- research groups often need a local, modifiable environment
- HAGRad was developed to fill that gap

## 2. Software concept and objectives

Explain:

- local hosting
- modular workflow design
- cardiovascular focus
- non-commercial scientific positioning
- separation between general viewer and specialized apps

## 3. Architecture

Describe:

- local browser-based interface
- local HTTPS server
- workflow modules
- shared export logic
- annotation and measurement concepts

Suggested figure:

- platform overview diagram showing the main viewer and the specialized modules

## 4. Implemented workflows

Suggested subsections:

### 4.1 HAGRad Viewer
- general cardiac CT viewing
- MPR
- annotations
- export

### 4.2 EAT Workflow
- contouring
- thresholding
- quantitative export

### 4.3 Coronary Workflow
- vessel-oriented assessment
- specialized measurements

### 4.4 QCA Workflow
- invasive angiography frame selection
- vessel analysis prototype

### 4.5 Stent Viewer
- stent-oriented analysis
- profile tools
- per-stent workflow

### 4.6 CalcScorer
- Agatston-style vessel-based calcium scoring

## 5. Quantitative outputs

Describe what HAGRad exports:

- PNG image outputs
- CSV tables
- measurement-level exports
- baseline characteristics exports
- workflow-specific quantitative outputs

## 6. Intended use and scope

Important section:

- research use only
- no claim of clinical validation
- not intended as a medical device
- not intended for routine patient care

## 7. Potential applications

Examples:

- retrospective imaging studies
- workflow prototyping
- quantitative figure generation
- observer studies
- teaching and demonstration

## 8. Limitations

Be explicit:

- currently a research platform
- not yet clinically validated
- some workflows are semi-automatic
- performance and platform support may vary
- manual correction may still be needed in advanced tasks

## 9. Future development

Examples:

- stronger modularization
- broader operating system packaging
- larger-scale validation
- improved semi-automatic vessel analysis
- more robust calcium and stent workflows

## 10. Conclusion

`HAGRad is a modular scientific software platform designed to support cardiovascular imaging research workflows through local viewing, reformation, quantitative analysis, and export. It provides a practical environment for developing and applying imaging methods outside rigid clinical software ecosystems.`

## Figures to prepare

1. Main HAGRad Viewer screenshot
2. EAT workflow screenshot
3. Coronary workflow screenshot
4. Stent Viewer profile-analysis screenshot
5. CalcScorer results table screenshot
6. Architecture/workflow diagram

## Tables to prepare

1. Overview of workflows and inputs/outputs
2. Supported quantitative measurements by module
3. Export schema summary

## Data you will likely need before submission

- representative example cases
- screenshots with anonymized data
- exact quantitative outputs per workflow
- technical description of export schemas
- a concise validation or reproducibility section if available

## Authorship planning

Potential author roles:

- software concept
- implementation
- cardiovascular imaging expertise
- workflow testing
- manuscript drafting

## Suggested next manuscript step

Write a `Methods` section first, because that will anchor the figures, abstract, and title much better than starting with the discussion.
