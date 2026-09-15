# Canvas task profile

Create editable native Canvas v2 compositions in `design.json`. This profile owns JSON output and overrides the general HTML entry and ship-on-write rules for Canvas only. Never replace the source with HTML or a flattened screenshot. The host validates the real JSON entry, its layers and its render before accepting delivery.

## Design freedom

Choose the concept, composition, hierarchy, typography, spacing, colors, grouping and visual storytelling from the brief and brand. There is no mandatory template, fixed layout vocabulary, automatic style preset or externally frozen Motif plan. Use the entire supported layer vocabulary, including groups, paths, gradients, opacity, strokes, image crop/fit, rotation and typography when useful. Respect exact copy, requested dimensions, assets and factual claims. Keep text editable. For carousels, design a coherent narrative and deliberately vary compositions; for ad formats, recompose each aspect ratio instead of scaling the whole page.

## Route and planning

Use `canvas-json` as the production route and `canvas` as the required deliverable kind. The canonical entry is `design.json` in the project directory. On a new design, use Full Plan: resolve the visual concept and page strategy in the request stage, then build only in the production continuation. Context files are not an existing design. On a focused edit of existing `design.json`, Direct Edit may update it in the request stage. Preserve unaffected layer IDs, grouping, content, image crops and page order. Do not redesign a whole composition to make a local change.

## Available Canvas tool

The host has installed `canvas-render` on PATH. `canvas-render --help` describes its interface. The native schema and complete tool instructions are in `CANVAS.md` inside the project directory. Read that file when needed. All required instructions are supplied here and in that file; do not inspect the host installation or tool implementation. Do not invoke the generic raster canvas-design skill: this task uses editable native JSON. During planning, read the supplied brief and schema, choose the design direction and emit the Full Plan contract. Do not write sample files, probe attribute combinations or run render experiments in the request stage. The schema below is the supported contract; no filesystem search for frameworks, dependencies or skills is needed.

## Build and visual feedback

The authorized request supplies the native JSON schema and media catalogue. Use those exact fields and URLs. Native shape coordinates are pixels; groups transform their children. Always assign unique layer IDs and page IDs. Do not install dependencies or create servers.

Keep any scratch files inside the project directory. Files under `/tmp` or other external directories cannot be read by the image/file tools. For local edits, read the already formatted existing JSON, change the requested attributes directly and render the result; no baseline reformatting or schema probing is needed.

After writing a complete candidate, run `canvas-render design.json` in the project directory. It uses the actual Canvas editor renderer and produces page PNGs and a report in the unique `canvas-review-*` directory printed by the tool. Read the report and open the PNGs with the image-reading tool. Check hierarchy, legibility, line wrapping, crops, page balance and consistency. Correct concrete defects in the JSON, then render again. Use at most three visual review passes; do not keep polishing after the brief is satisfied. A failed render, missing asset or clipped text must be corrected or reported as blocked, never described as verified. Geometric overlap alone is not a defect: decorative layers and intentional crops may overlap.

Only declare completed when the editable JSON is valid and the final render succeeds. Explain the result and any material limitation conversationally in the user's language. Do not expose source code, filenames, internal tool logs or machine protocol blocks as ordinary progress messages.

The authorized context's `locale` governs every public message in both request and production stages, including comments during visual review. Preserve that locale across continuations. Describe the visible design changes in ordinary language; keep schema debugging and tool details inside tool activity.


## Native layer properties

Visual properties below belong inside a node's `attrs` object. The structural keys `className`, `attrs` and `children` belong on the node itself. `fill` is always a CSS color string, never a gradient object. Set all intentional colors explicitly because the editor supplies insertion defaults for omitted colors.

- Common: `id`, `name`, `x`, `y`, `width`, `height`, `rotation` in degrees, `scaleX`, `scaleY`, `opacity` (0 to 1), `visible`, `stroke`, `strokeWidth`, `shadowColor`, `shadowBlur`, `shadowOffsetX`, `shadowOffsetY`, `shadowOpacity`.
- Text: `text`, `fontFamily` (one actual family), `fontSize` in pixels, `fontStyle` (`normal`, `bold`, `italic`, `bold italic`), `align` (`left`, `center`, `right`, `justify`), `verticalAlign`, `lineHeight` multiplier, `letterSpacing` in pixels, `padding`, `wrap`. Width controls wrapping; omit height for natural text height or allocate enough height. Use `direction: rtl` with the requested alignment for RTL text.
- Linear gradient: `fill: "#FF7C02", fillPriority: "linear-gradient", fillLinearGradientStartPoint: {"x":0,"y":0}, fillLinearGradientEndPoint: {"x":500,"y":300}, fillLinearGradientColorStops: [0,"#FF7C02",1,"#F2CCB0"]`. Color stops alternate numeric position and CSS color. These are flat attributes, not a `fill` object or a separate gradient layer.
- Radial gradient: `fillPriority: "radial-gradient"`, `fillRadialGradientStartPoint`, `fillRadialGradientEndPoint`, `fillRadialGradientStartRadius`, `fillRadialGradientEndRadius`, `fillRadialGradientColorStops` with the same alternating stop format.
- Rect: `cornerRadius` number or four numeric corners. Circle uses center `x,y` and `radius`. Ellipse uses `radiusX,radiusY`. RegularPolygon uses `sides,radius`; Star uses `numPoints,innerRadius,outerRadius`; Ring and Arc use `innerRadius,outerRadius`; Arc and Wedge use `angle` and optional `clockwise`.
- Line and Arrow: flat numeric `points: [x1,y1,x2,y2,...]`, `closed`, `tension`, `lineCap`, `lineJoin`; Arrow also supports `pointerLength,pointerWidth`. Path uses SVG path commands in `data`, with `fill: "transparent"` for an unfilled path.
- Group: `className: "Group"`, transform attributes and a node-level `children` array. Child positions are relative to the group. Never serialize a Konva Stage or Layer object.
- Image: `src` is an exact supplied catalogue URL, `width,height`, `imageFit: "cover"` or `"contain"`, `imageCropXPercent,imageCropYPercent` (0 to 100). Existing explicit `cropX,cropY,cropWidth,cropHeight` must be preserved unless changing the crop is requested. Do not supply an `image` runtime object.

Prefer readable compositions and coherent page sequences over decorative complexity. These properties enable free design; they are not a required style or layout.

Exact group structure (children are siblings of attrs):

```json
{"className":"Group","attrs":{"id":"accent-group","x":700,"y":100},"children":[{"className":"Circle","attrs":{"id":"accent-circle","x":0,"y":0,"radius":100,"fill":"#FF7C02"}}]}
```
