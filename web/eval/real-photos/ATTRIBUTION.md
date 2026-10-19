# SkyFinder photographs used for the real-photo evaluation

**Source:** [SkyFinder Dataset, version 1](https://zenodo.org/records/5884485), DOI [10.5281/zenodo.5884485](https://doi.org/10.5281/zenodo.5884485).

**Dataset creators / attribution:** Nathan Jacobs (University of Kentucky) and Radu Paul Mihail (Valdosta State University).

**License:** [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode). On 2026-10-19, the publisher's public record identified the dataset as CC BY 4.0. This attribution and license apply to all 36 retained photographs and their evaluation derivatives. The repository's code license does not replace their image license. The dataset creators do not endorse this app or its conclusions. The record does not individually identify every webcam photographer; the supplied dataset attribution is preserved here.

**Citation:** Mihail RP, Workman S, Bessinger Z, Jacobs N. 2016. *Sky Segmentation in the Wild: An Empirical Study*. IEEE Winter Conference on Applications of Computer Vision (WACV), 1–6. DOI: [10.1109/WACV.2016.7477637](https://doi.org/10.1109/WACV.2016.7477637).

**Changes made:** EXIF orientation applied; RGB conversion; aspect-preserving resize to at most 512 pixels on the longest edge; lossless PNG encoding with metadata removed. The input baselines have no content edits. During evaluation, the runner additionally makes JPEG quality 40/60/80/90 versions and controlled opaque-patch / copy-move / two-patch edits with JPEG quality 80. These derivatives are clearly labelled as evaluation edits and never presented as documentary photographs. They are generated in memory, not saved as original sources.

**Per-photo provenance:** `sources.json` supplies the public archive URL, member filename and its timestamp (timezone unknown), camera ID, archive MD5, original-frame SHA-256, retained-file SHA-256, image dimensions, and split. `protocol.json` fixes selection independently of detector results. Only these manually selected archives are fetched; there is no general crawler or search index.

**Storage:** Only these 512px-or-smaller derivatives and compact provenance are retained. Downloaded ZIPs, source-resolution photos and the source page HTML are processed in memory and not written to disk.

**Access policy:** `scripts/prepare-real-photos.py` checks the public record's license and robots.txt, observes a 10-second minimum interval, accepts no redirects, and stops on access errors. During initial source discovery, one metadata API read was made before the fetched robots rules were evaluated. After `/api` was found to be disallowed, no further record API requests were used. The license was independently checked again on the allowed public record page; acquisition uses the allowed record/file URLs. No bot block or paywall was bypassed.
