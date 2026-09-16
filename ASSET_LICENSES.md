# LIEUVA asset and licensing notice

This repository combines application code, gallery models, artwork, fonts, material images, and generated concept files. Public access to the repository does not by itself grant a license to reuse those materials.

## Danny Hirsch demo

The project owner has confirmed permission to display and distribute the Danny Hirsch artwork and Space assets as part of the LIEUVA live demo. Relevant files include:

- `public/assets/demo/danny-gallery.glb`
- `public/assets/demo/danny-gallery-mobile.glb` — a LIEUVA-only mobile derivative of the same model, simplified and recompressed without changing its authored metadata
- `public/assets/demo/danny-cover.webp`
- Danny Hirsch artwork embedded in or displayed by the demo model

That permission is specific to their use within this LIEUVA project. It does not automatically grant repository visitors permission to extract, resell, sublicense, train on, or redistribute the artwork or model separately. Contact the project owner and artist for any use outside the LIEUVA demo.

## LIEUVA promotional image

`public/assets/demo/aura-hero-gallery.webp` is a compatibility-preserved filename used for LIEUVA promotional artwork and as the social-sharing image for the deployed site. No standalone third-party reuse license is declared in this repository.

## Generated LIEUVA demo artwork and Space previews

The three fictional studies in `public/assets/artworks/` were generated specifically for the product demo. Exact generation and processing details are recorded in [`public/assets/artworks/README.md`](./public/assets/artworks/README.md). They are not presented as works by a real artist.

The three active preview images in `public/assets/templates/` are captures from the interactive Studio, refreshed on 2026-09-09. They replace the ImageGen concept images used previously. Their current role and provenance are recorded in [`public/assets/templates/README.md`](./public/assets/templates/README.md).

## Material images

Unlicensed legacy material images and superseded generated variants were removed from the repository. The runtime uses only the LIEUVA-generated base-color textures documented with generation records and checksums in [`public/assets/materials/README.md`](./public/assets/materials/README.md). The generated files are albedo only; no PBR map is implied.

## Fonts

The application bundles Manrope and Instrument Serif font files under `src/assets/fonts/`. Both upstream projects distribute the fonts under the SIL Open Font License 1.1. The required copyright notices and full license text are included in [`public/licenses/FONT-LICENSES.txt`](./public/licenses/FONT-LICENSES.txt) and ship with the deployed site.

- Manrope upstream: <https://github.com/sharanda/manrope>
- Instrument Serif upstream: <https://github.com/Instrument/instrument-serif>

## Blender concept files

The `.blend` files in `blender/templates/` and the generator in `blender/create_templates.py` are project concept/reference materials. They are not the source of the current runtime room geometry, and no standalone reuse license is declared for them.

## Application code

No general `LICENSE` file is currently present. Unless and until the rights holder adds one, do not assume the application source is open-source or available for downstream commercial reuse.

This notice records the repository's current licensing state without assigning new rights or replacing agreements held by the project owner.

## Blender premium production — September 2026

`blender/production/build_premium.py` and `runtime_bakes.py` create original metric gallery architecture, fixtures, geometry-only AO maps and the fictional bronze ribbon study for LIEUVA. Generated geometry is not a scan or a downloaded third-party model. Packed albedos are derivatives of the existing documented LIEUVA material library; the runtime charcoal map is a tinted derivative of `aura-greige-microcement-v5.webp`. No additional external texture, model, HDRI or MCP package was downloaded for production.

`blender/production/v1/` retains editable sources and three native 3840×2160 Cycles beauty masters. `v2/` retains packed editable beauty/runtime sources. `public/assets/templates/premium-v3/` contains the only six shipping template exports; older runtime versions, generated previews, backups and logs remain recoverable from Git history. `blender/production/v3/` holds the current editable sources, camera studies, runtime maps and 4K Cycles masters. Beauty staging uses the existing fictional demo studies, never Danny's licensed artwork, and is excluded from runtime exports.

The three `public/assets/templates/*-preview.webp` images were refreshed from actual Studio capture output on 2026-09-09. They represent the interactive renderer, not the Cycles beauty masters. The user-provided architectural screenshots were used as visual references only and are not redistributed in product assets. No standalone reuse license for these project assets is granted here.


## Studio design catalogue · 2026-09-08

The new sage, ink-blue, rose and sand wall surfaces and cork, terracotta, basalt-terrazzo and basketweave-parquet floors are deterministic procedural materials authored in `src/features/gallery/GalleryScene.tsx`. Their 512px albedo and 256px height/roughness maps are created locally on demand. They are not photographs, scans, downloaded material libraries, or ImageGen outputs. Existing runtime AO maps remain separate and are retained when a finish changes.

The lounge chair, stone table and light column are original procedural geometry in `src/features/gallery/scene/designObjects.ts`, assembled with Three.js primitives and the existing RoundedBoxGeometry helper. They do not reproduce a named designer's product and introduce no external model or texture license. Previously hidden Monstera, branch vase, walnut stool and rope barrier models reuse the project's existing geometry. Legacy Ficus and gallery-bench IDs remain supported, but are not offered as additional catalogue variants. No standalone reuse license is granted for these project assets.

## Production bundle optimization · 2026-09-08

Terser 5.51.2 is a pinned, build-only development dependency under BSD-2-Clause (license in its installed package and upstream repository). It is not an additional browser runtime. The build compacts whitespace in recognized Three.js shader strings while preserving their tokens and preprocessor instructions; Three.js remains under its existing MIT license and the transform leaves its JavaScript/license notices intact. No artwork, texture, model, GLB, Blender source or visual asset was added or replaced in this fix.

## Premium-v3 generated material and camera studies · 2026-09-09

`blender/production/v3/material-studies/` contains original project-specific generated concrete, limestone and oak albedo studies from the built-in OpenAI image-generation tool. Shipping derivatives are in `public/assets/materials/premium-v3/`; the material README records dimensions, processing, briefs and SHA-256 hashes. The backend model was not reported. No third-party photograph or the user's reference UI screenshots is redistributed as a new texture.

The new homepage uses LIEUVA's three fictional demo studies and shared Studio renderer. It does not copy Danny Hirsch's works or change the separate licensed demo. Camera paths and geometry are project-authored; these records do not grant a new standalone redistribution license.

## Editorial story and floor relief · 2026-09-09

`public/assets/templates/story/` contains optimized captures of original LIEUVA
runtime geometry/materials at the authored homepage opening camera. No user
reference screenshot, third-party artwork or generated UI is incorporated.
Dimensions, capture provenance, encoding and hashes are recorded in its README
and manifest. These assets are preparation posters, not new 4K beauty masters.

`blender/production/v3/story/` contains a separate project-authored camera source,
three camera QA stills, a packed material library and three material QA closeups.
It reuses the existing fictional LIEUVA sample artwork and material albedos. Its
independent deterministic height/roughness maps are project-authored, not derived
from copyrighted photographs or copied from albedo brightness. The directory's
manifests record source/output hashes and the source-vs-runtime staging boundary.
Existing project provenance applies; no additional standalone reuse license is
granted. The eleven concept screenshots remain art-direction references only.


### Emil direction v2 · 10 September 2026

The four newly supplied storyboard boards and the direction document are references,
not embedded website assets. The new floor-plan lines and mobile dock glyphs are
original code geometry. Opening posters were recaptured from the actual prepared
runtime at the first shot; their manifest records current hashes and WebP encoding.
The separate Blender camera study and three QA stills were regenerated against all
1,729 runtime camera samples. Its retained beauty staging differs from the editable
three-work browser draft; the README makes that boundary explicit. Existing 4K
masters, runtime GLBs, PBR images and material closeups were not replaced.


## Obsidian bespoke showcase · 2026-09-15

The project owner supplied the `Obsidian-Three-Rooms` reference package and explicitly requested use of its eleven artworks in this LIEUVA showcase. The package declares those works and its room references to be AI-generated. The provider/model is not specified; no additional provenance is inferred. Original artwork PNGs are retained byte-for-byte in `blender/showcases/obsidian/source/artworks/`, with the supplied checksum index and layout. Full-resolution WebP encoding derivatives ship under `public/assets/showcases/obsidian/artworks/`; no image content is regenerated or artist attribution invented.

`blender/showcases/obsidian/build.py` reconstructs original metric geometry and procedural materials from the supplied plan. Packed Blender sources, lightmaps and Cycles masters are retained there. The showroom GLBs and cover are derived from that reconstructed scene, not from the supplied perspective reference images. Online Blender documentation and Reddit discussion informed technique only; no external image, model, HDRI or material asset was downloaded. No standalone resale, reuse, sublicensing or training license for these assets is declared.

## Sculpture Pavilion bespoke showcase · 2026-09-15

The owner supplied `Sculpture-Pavilion` and explicitly requested its use for the Sculpture & 3D showcase. Its 65 concept views are declared AI-generated; no provider/model or additional rights are inferred. The complete supplied reference images, specifications, prompts, checksum index and plans remain under `blender/showcases/sculpture-pavilion/source/`. No reference image is presented as a finished 3D render.

`build.py` creates original procedural architecture and five sculpture reconstructions from those concepts. The GLBs, 4K Cycles masters, sculpture portraits, lightmaps and runtime covers derive from that scene. No external model, texture or HDRI was incorporated. The asset manifest records source and delivery checksums. This owner-authorized project use does not declare a separate resale, sublicensing or training license.

## Forest Fold House bespoke architecture · 2026-09-16

The project owner supplied `Forest-Fold-House` and explicitly requested its reconstruction and use for the Architecture showcase. The supplied package identifies its 28 concept images as AI-generated with an integrated image generator; no particular provider/model or additional rights are inferred. The two inspirational reference images, complete original package, plans, prompts, PDF and JSON schedules are preserved byte-for-byte under `blender/showcases/forest-fold-house/source/`. Concept images are references, not photographs or finished Blender renders.

The new house geometry, metric joinery, furniture, procedural surface shaders, beech/fern/grass meshes, Cycles renders and browser derivatives are authored for this project from that dimensional brief. No external HDRIs, textures, purchased furniture or third-party model assets were added. Public WebP images are encoding derivatives of actual Blender output; the original AI reference pictures do not ship as runtime backdrops or pretend 3D previews. The concept is not a construction document or a claim of a built property.
