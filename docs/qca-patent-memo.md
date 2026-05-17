# HAGRad QCA Patent Assessment Memo

Prepared for internal discussion with university technology transfer / innovation office  
Date: 2026-04-01  
Prepared from the current HAGRad QCA prototype codebase and general patentability framework sources

## 1. Important disclaimer

This memo is a practical invention-assessment document, not legal advice and not a patentability opinion. Patentability, inventorship, ownership, public-disclosure effects, and filing strategy must be confirmed by qualified patent counsel and by the university's technology-transfer office.

## 2. Executive summary

### Bottom-line view

The current HAGRad QCA application is unlikely to be broadly patentable as the general concept of a quantitative coronary angiography application that:

- loads DICOM angiography runs
- lets a user choose a still frame
- segments a vessel
- allows manual correction
- computes stenosis-related measurements
- exports results

Those elements, at that level of generality, are likely to face substantial prior-art and obviousness risk.

However, several specific technical sub-methods in the present implementation may be worth evaluating for patent filing, especially if they are described narrowly and technically rather than claimed as a broad clinical software concept.

### Best current patent candidates

1. Stroke-to-geometry editing for centerline and vessel border refinement.
2. Border harmonization that smooths edited contours while preserving pinned manual control samples.
3. The specific semi-automatic single-frame QCA workflow combining anchor-guided tracing, optional border hints, vessel/background tone references, and local manual contour control.

### Overall recommendation

- Treat the app itself as a potentially commercial product regardless of patent outcome.
- Evaluate patents only on the most technically distinctive sub-methods.
- Avoid broad claims such as "a QCA application" or "a system for measuring coronary stenosis from angiography."
- Move quickly on disclosure review if patent filing is seriously being considered.

## 3. What the current application actually is

The current HAGRad QCA prototype is a semi-automatic, single-frame, research-oriented 2D QCA application for invasive coronary angiography. It supports:

- loading multiple angiographic DICOM cine series
- selecting one still frame for analysis
- anchor-based vessel selection
- semi-automatic centerline and border detection
- manual centerline, border, and stenosis editing
- calibration using catheter size
- PNG, CSV, and portable case-bundle export
- reopening and re-editing prior stenoses within the study

This is important from a patent perspective because a "QCA tool" is not itself likely to be novel. Novelty, if any, must reside in the specific technical implementation.

## 4. Codebase areas reviewed for potential invention candidates

The following current implementation areas were reviewed as the likely technical core:

- Portable editable case bundle export and import  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:718`  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:819`

- Localization / saved stenosis workflow  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:2347`  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:3157`

- Segmentation hinting and vessel model estimation  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:3835`

- Offset interpolation and border harmonization  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4293`  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4309`

- Border detection and derived-geometry rebuild  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4440`  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4683`

- Full vessel segmentation pipeline  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4764`

- Draw-to-centerline and draw-to-border editing methods  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:6819`  
  `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:6881`

## 5. Patentability framework relevant to this project

### United States

In the United States, a patent candidate must clear at least:

- patent-eligible subject matter
- novelty
- nonobviousness
- adequate written description / enablement

For software, the key issue is often subject-matter eligibility under 35 U.S.C. 101. Claims directed only to abstract ideas are at risk. Claims that are framed as specific technical improvements to image processing, contour reconstruction, or device-guided analysis may fare better than claims framed as data analysis or clinical decision logic at a high level.

### Europe

In Europe, software is not automatically excluded if it produces a further technical effect beyond normal software-hardware interaction. That can help for image-processing or technical workflow inventions.

However, diagnostic methods practised on the human or animal body are excluded under Art. 53(c) EPC. That does not automatically kill all software claims, but it means claim drafting matters greatly. Image-processing or editing methods may be more viable than claims written as diagnostic methods performed on a patient.

### Practical implication

The safest patent candidates here are technical editing / reconstruction / software-processing methods, not broad diagnostic or clinical-use claims.

## 6. Strongest candidate inventions

## 6.1 Candidate A: Stroke-to-geometry editing for centerline and vessel borders

### Why it matters

This is the most promising candidate in the current implementation.

The system allows the user to activate a drawing mode, sketch a temporary dashed stroke onto either:

- the centerline, or
- one vessel border

and then, on release, the system converts that stroke into a local geometry update that is merged back into the pre-existing centerline or contour structure rather than simply storing the stroke as a freehand trace.

### Why it may be patent-relevant

The potentially novel aspect is not "drawing on a medical image." That is likely old.

The potentially patent-relevant aspect is the specific conversion pipeline:

- determine the active target structure
- map freehand stroke to a local sample range on existing vessel geometry
- preserve geometry outside the local range
- derive new local control points from the stroke
- reintegrate the edited local structure into the full vessel representation
- rebuild a smooth final centerline or border contour suitable for QCA measurement

### Code basis

- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:6819`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:6881`

### Strength assessment

Potential strength: `moderate`

Reason:

- It is technically specific.
- It is tied to vessel geometry editing rather than generic annotation.
- It may be distinguishable from ordinary spline editing if the local reintegration method is genuinely new.

### Main risk

Freehand-to-curve editing is a known class of UI/image-editing technique. The patentability question is whether this specific medical-image vessel-geometry adaptation is sufficiently novel and nonobvious.

### Recommended claim direction

Focus on:

- local sample-range selection from stroke endpoints
- control-point replacement within the selected local range
- reintegration into a constrained vessel centerline / border model
- use in a QCA measurement pipeline after the update

Do not lead with:

- "user draws a line on an angiographic image"

## 6.2 Candidate B: Border harmonization with pinned manual control preservation

### Why it matters

The border-editing workflow now does more than naïve interpolation. It:

- interpolates manual border offset controls
- reconstructs border contours from the offsets
- smooths the contours
- preserves the manually fixed control samples
- re-derives harmonized offsets from the smoothed contour
- maintains the possibility of severe stenosis / near-occlusion while suppressing unrealistic angular edges

### Why it may be patent-relevant

This is a more technical and less generic story than ordinary "smoothing." The distinctive idea is smoothing while preserving local user-imposed anatomical constraints important for stenosis quantification.

### Code basis

- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4293`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4309`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4683`

### Strength assessment

Potential strength: `moderate`

Reason:

- It is a technical contour-reconstruction method.
- It is tied to measurement integrity, not only cosmetics.
- It is narrower and more concrete than a broad "smooth vessel border" claim.

### Main risk

Spline interpolation, control-point preservation, and smoothing with pinned nodes are all known families of techniques. The patent question is whether the specific combination and use in QCA border reconstruction is sufficiently nonobvious.

### Recommended claim direction

Focus on:

- lumen-border reconstruction from offset controls around a centerline
- smoothing in image/contour space
- preservation of designated control samples
- re-derivation of offset values from the smoothed border
- maintenance of quantifiable stenosis geometry after smoothing

## 6.3 Candidate C: Semi-automatic single-frame QCA segmentation guided by user hints

### Why it matters

The application is intentionally designed around a still-frame QCA workflow rather than automated cine-wide tracking. The user:

- selects one steady frame
- places centerline anchors
- optionally provides border hints
- optionally samples vessel/background tone references
- runs segmentation
- manually edits the result

### Why it may be patent-relevant

The strongest angle here is not "single-frame QCA" alone. That is unlikely to be new.

The best angle is the specific interaction architecture for semi-automatic segmentation:

- still-frame selection
- anchor-guided vessel pathing
- optional left/right border hints
- optional vessel/background intensity references
- semi-automatic border finding biased by those hints
- post-segmentation local editing

### Code basis

- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:3835`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4440`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:4764`

### Strength assessment

Potential strength: `low-to-moderate`

Reason:

- It is coherent and clinically practical.
- It may be commercially valuable.
- But many of its ingredients are individually common in image segmentation workflows.

### Main risk

An examiner may view this as an aggregation of known image-processing and editing techniques applied to angiography.

### Recommended claim direction

If pursued, claim only a narrow and technically specific combination, especially if there is a measurable segmentation improvement tied to the hint model.

## 7. Secondary candidates

## 7.1 Portable editable case bundle

The application can export a portable bundle containing:

- embedded original DICOM files
- series state
- editable analysis state
- report-entry history

and then reopen that bundle into a restorable editing session.

### Code basis

- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:718`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:819`

### Assessment

Commercially useful: `high`  
Patent strength: `low-to-moderate`

Reason:

Session packaging and bundle restoration are valuable, but generally crowded. It may still be worth mentioning to counsel as a fallback or secondary filing theme if the restoration of editable medical-image state proves more specific than typical document/session-save systems.

## 7.2 Saved stenosis reopening workflow

The application stores prior stenoses within the study and allows reopening/editing them later in the same case workflow.

### Code basis

- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:2347`
- `/Users/mt_hagar/Documents/Playground/ppt-dicom-viewer/src/qca/qca.js:3157`

### Assessment

Commercially useful: `high`  
Patent strength: `low`

Reason:

This is likely better viewed as a product and usability feature than a patent core.

## 8. Features that are probably too weak for standalone patent claims

The following are important product features but likely weak as standalone patent positions:

- loading DICOM cine or frame series
- selecting a best still frame
- manual centerline movement
- manual border movement
- proximal/distal stenosis markers
- calibration using known catheter size
- lesion or stenosis labeling
- CSV / PNG report export
- vessel and coronary segment selection
- help panels and workflow navigation

These features can support context in a specification, but on their own they probably do not justify filing.

## 9. Main legal and strategic risks

## 9.1 Prior-art risk

This field is crowded. QCA, vascular centerline extraction, coronary border detection, spline/contour editing, catheter calibration, and angiographic segmentation all have deep prior art.

The risk is not only that identical prior art exists. The bigger risk is that an examiner may combine known references and argue that the claimed method would have been obvious.

## 9.2 Subject-matter eligibility risk in the U.S.

If claims are drafted at a high level as image analysis, measurement, evaluation, or diagnosis logic, they may face 35 U.S.C. 101 problems as abstract idea claims.

The better path is to present the invention as:

- a technical image-editing method
- a technical contour-reconstruction method
- a technical image-processing workflow that improves the functioning of a QCA analysis tool

## 9.3 Diagnostic-method risk in Europe

Claims framed as diagnostic methods practised on the human body may face EPC Art. 53(c) exclusion issues.

The better path is to frame claims around:

- image-processing
- contour editing
- data reconstruction
- software-controlled technical operations on acquired image data

## 9.4 Public-disclosure risk

If the invention has already been publicly disclosed in talks, posters, websites, repositories, demos, publications, or broad outside presentations, that may impair patent rights, especially outside the U.S.

This issue should be clarified immediately.

## 9.5 University ownership / inventorship risk

The university meeting should not assume that the same people are:

- inventors
- owners
- authors of code
- future company founders

Those are separate questions.

If university employees, students, or funded research personnel contributed, ownership and disclosure obligations may already be governed by:

- employment agreements
- student IP policy
- invention-assignment agreements
- grant conditions
- institutional policy

If federally funded research was involved in the U.S., Bayh-Dole issues may also apply.

## 10. Immediate issues to clarify before the university meeting

The following questions should be answered internally before or during the meeting:

1. Who are the actual inventors of the possible patentable sub-methods?
2. Was any of the work done under university employment, university facilities, or university funding?
3. Was any of the work supported by federal or external grant funding?
4. Has the invention already been publicly disclosed anywhere?
5. Are there any outside collaborators, contractors, or students who contributed technically?
6. Is the priority goal:
   - publication
   - patent filing
   - spinout company formation
   - sponsored research / licensing
7. Is the university expected to own the IP, co-own it, or decline it?

## 11. Recommended talking points for the university meeting

### Recommended positioning

Describe the project as:

"A semi-automatic single-frame QCA software platform for invasive coronary angiography, with potentially patentable sub-methods in vessel-geometry editing, border harmonization, and constrained freehand-to-contour reconstruction."

This is a much better framing than:

"We built a QCA app."

### Key message to convey

The commercial value may exist even if the patent position is narrow. The objective of the meeting should not be to convince the university that the entire app is patentable. The objective should be to determine whether one or more narrowly defined technical sub-methods merit filing.

## 12. Questions to ask the university technology-transfer office

1. Based on the current prototype, which aspects appear most protectable to you?
2. Should we consider a rapid provisional filing before any broader disclosure?
3. What prior-art search scope would you recommend for QCA segmentation and vessel-editing methods?
4. How would the university assess inventorship across faculty, students, and non-university collaborators?
5. Does the university claim ownership automatically under current policy?
6. Were any grant-reporting or Bayh-Dole disclosure obligations triggered already?
7. Would the university support a patent filing if the strongest claims are narrow but commercially relevant?
8. If not, would the university consider releasing the IP or allowing a spinout-led filing?

## 13. Suggested filing strategy if the university is interested

### Best-case near-term strategy

1. Freeze the invention story around the strongest 1-2 technical methods.
2. Conduct a focused prior-art search.
3. File quickly before broader public disclosure, if not already disclosed.
4. Use the specification to describe the whole QCA system, but center the claims on the strongest technical methods.
5. Consider keeping weaker workflow/UI features as trade secret / know-how rather than patent claims.

### Claiming strategy

Most likely stronger:

- method claims for technical contour reconstruction
- method claims for constrained stroke-to-vessel editing
- system claims tied to a QCA workstation implementing those methods

Most likely weaker:

- claims to generic stenosis measurement workflow
- claims to general DICOM loading and report generation
- claims drafted as diagnostic decision logic

## 14. Commercial reality check

A good product does not need a broad patent to be commercially viable.

For this project, the likely business value may come from:

- being genuinely useful to interventional imaging users
- having an elegant workflow
- fast iteration
- regulatory or validation know-how
- integration into institutional workflows
- data / validation assets
- domain expertise

It is entirely possible that this project is:

- commercially promising
- academically valuable
- worth protecting selectively

without being broadly patentable in the way a founder might initially hope.

## 15. Honest conclusion

### My blunt view

If the question is:

"Can the whole HAGRad QCA app be patented as a general concept?"

My answer is: probably not in a strong way.

If the question is:

"Are there specific technical methods inside the app that may be worth a patent discussion?"

My answer is: yes, especially:

- draw-stroke-to-vessel-geometry editing
- pinned-control border harmonization
- possibly the full hint-guided single-frame segmentation workflow if narrowly defined

### Recommendation for the university meeting

Go in with a realistic posture:

- not "we have a whole app to patent"
- but "we may have 1-3 patentable technical methods inside a strong QCA software platform"

That is a credible and serious discussion position.

## 16. Appendix: official reference points consulted

- USPTO subject matter eligibility guidance:  
  https://www.uspto.gov/patent/laws-and-regulations/examination-policy/subject-matter-eligibility

- USPTO MPEP § 2106, patent subject matter eligibility:  
  https://www.uspto.gov/web/offices/pac/mpep/s2106.html

- USPTO provisional application guidance and public-disclosure warning:  
  https://www.uspto.gov/patents/basics/apply/provisional-application

- USPTO AIA prior-art / grace-period exception guidance:  
  https://www.uspto.gov/web/offices/pac/mpep/s2153.html

- EPO guide on software patentability and diagnostic-method exclusions:  
  https://www.epo.org/en/legal/guide-epc/2024/ga_c3_2.html

- EPO guideline on limits of the Art. 53(c) diagnostic-method exclusion:  
  https://www.epo.org/en/legal/guidelines-epc/2025/g_ii_4_2_1.html

- NIH intellectual property policy page discussing Bayh-Dole reporting:  
  https://grants.nih.gov/grants/intell-property.htm

- NIST iEdison / Bayh-Dole reporting overview:  
  https://www.nist.gov/iedison/about-iedison
