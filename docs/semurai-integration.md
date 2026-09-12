# Semurai integration boundary

This fork implements the internal engine for Semurai Creative. Laravel owns
identity, authorization, projects, versions, usage and the existing MySQL
database. Semurai object storage owns permanent binaries and source bundles.
The daemon database and working files are recoverable engine state only.

## Provenance

- Origin: https://github.com/Prixamocom/semurai-creative-engine.git
- Upstream: https://github.com/nexu-io/open-design.git
- Base inspected on 2026-09-12: `ad9078b87c2d08e537ca3e041c46c124e7380c9c`
- Base package version: 0.22.1. No release tag directly names that commit.
- Branch: `feature/semurai-integration`
- Latest upstream release at audit: `open-design-v0.22.2`; main and release
  histories differ. Never infer deployed revision from package version alone.

## Integration seams

`apps/web/src/semurai/branding.ts` isolates optional UI branding. Build with
`NEXT_PUBLIC_SEMURAI_CREATIVE=1` for Semurai; the default upstream mode remains
available for comparison. Bundled labels are adapted before variable
interpolation, so user content is not rewritten. This initial seam does not
alone make the entire Studio ready for public exposure: project-scoped SSO,
restricted navigation and authenticated route proxying are required first.

Use daemon `/api/projects`, `/api/runs`, run events/result-package and scoped
project file APIs behind `OpenDesignCreativeEngine` in the Creative service.
The public application must never consume these upstream contracts directly.
Consult `docs/orchestrator-workspaces.md` and the root AGENTS data-directory
contract for scratch workspace metadata. Scratch provenance alone is not a
security boundary; run-level process/container and file isolation are required.

Keep native Semurai Canvas in Nuxt/Vue for graphics, carousels and ads. Reuse
the current Studio preview, manual edit and deck export capabilities only for
landing, presentation and document workspaces. Prefer editable PPTX exports;
validate the actual PowerPoint object structure in acceptance tests.

At the pinned upstream revision, `import-export-routes.ts` requires the desktop
renderer for editable PPTX and raster exports. Semurai Studio adapts that same
pinned browser converter through `packages/artifact-renderer` and an opaque,
sanitized browser frame. It does not call the desktop-only export endpoint.
The baseline daemon health check does not validate exports; inspect actual
PPTX parts and exercise the authenticated save/download flow separately.

## Adapted Studio

The branded `semurai-studio` build serves presentations, landing pages, email,
documents and reports through a project-scoped session. Its Core callback is
held by the Creative service, never exposed as a browser bearer credential.
Laravel remains authoritative for source, versions, jobs and private exports.

`StudioEditor` reuses the upstream preview, direct-edit bridge and deck runtime.
Source HTML/CSS and speaker notes are saved together. Presenter view captures
the current document for the duration of the show and displays current/next
slides, notes and elapsed time. Only the current slide enters full screen.
Navigation returns to the editor's last viewed slide without creating a version.

HTML and native PPTX exports use the saved version. PPTX notes are copied from
that snapshot into the converter's existing notes bodies with XML APIs; native
slides, masters and relationships are retained. The browser download and the
private stored copy contain identical bytes. Previous exports keep their own
version association. PDF currently uses browser printing.

Project chat renders public assistant replies and references. Users can attach
PNG/JPEG/WebP images, paste/drop files or select owned media-library images.
The Core service normalizes images and resolves authorized image references;
the model receives descriptive context and catalogue URLs. A separate DeepSeek
image-analysis call supplies reference descriptions before generation/editing.
No arbitrary browser-provided image URL is fetched by this path.

Focused checks cover these integration seams. Full cross-format AI generation,
PowerPoint application/visual validation and operational acceptance remain
separate release gates; a successful static build does not prove those flows.

Do not mount the host Docker socket in the Creative service or engine. Do not
publish port 7456. A trusted orchestration process provisions run sandboxes;
only the authenticated Creative service may reach their engine endpoints.
Use least-privilege per-run storage URLs and provider credentials. Do not set
upstream analytics or tracing credentials to send private runs to third parties.

## Upstream updates

The container retains Markdown license/notice files in installed dependencies
and includes the separate design-template registry. The upstream recipe's
blanket Markdown deletion and omitted design templates are not carried into
the Semurai image.

1. Fetch upstream and inspect the chosen release and security changes.
2. Merge the explicitly selected SHA into a separate integration branch.
3. Preserve LICENSE, source notices and THIRD_PARTY_NOTICES.md.
4. Run guard, typechecks, relevant tests, container build and internal health.
5. Run Semurai tenant isolation, save/reload, export and provider failure tests.
6. Deploy staging, then a digest-pinned production image only after gates pass.
7. Record fork commit, upstream SHA, base-image digest and rollback image.

Do not merge to main or force-push automatically.
# Model runtime image

`deploy/Dockerfile.semurai-runtime` layers the pinned OpenCode 1.18.30 BYOK
runtime onto the tested Semurai image. Its base commit tag must be checked
against the recorded local image ID before building; deploy the resulting
immutable image ID. The explicit pinned-package postinstall prepares the native
runtime executable, and the build verifies its version. Semurai's host broker
creates a separate hardened container and data/workspace mounts for each run.
No daemon port is published. Provider credentials are supplied per run; the
image contains no credentials. Simple Canvas patches bypass this runtime.
