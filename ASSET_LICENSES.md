# AURA asset and licensing notice

This repository combines application code, gallery models, artwork, fonts, material images, and generated concept files. Public access to the repository does not by itself grant a license to reuse those materials.

## Danny Hirsch demo

The project owner has confirmed permission to display and distribute the Danny Hirsch artwork and gallery assets as part of the AURA live demo. Relevant files include:

- `public/assets/demo/danny-gallery.glb`
- `public/assets/demo/danny-gallery-mobile.glb` — an AURA-only mobile derivative of the same model, simplified and recompressed without changing its authored metadata
- `public/assets/demo/danny-cover.webp`
- Danny Hirsch artwork embedded in or displayed by the demo model

That permission is specific to their use within this AURA project. It does not automatically grant repository visitors permission to extract, resell, sublicense, train on, or redistribute the artwork or model separately. Contact the project owner and artist for any use outside the AURA demo.

## AURA promotional image

`public/assets/demo/aura-hero-gallery.webp` is used as AURA promotional artwork and as the social-sharing image for the deployed site. No standalone third-party reuse license is declared in this repository.

## Generated AURA demo artwork and room previews

The three fictional studies in `public/assets/artworks/` were generated specifically for the product demo. Exact generation and processing details are recorded in [`public/assets/artworks/README.md`](./public/assets/artworks/README.md). They are not presented as works by a real artist.

The three images in `public/assets/templates/` are captures of the actual AURA WebGL editor using those studies. Their capture method and checksums are recorded in [`public/assets/templates/README.md`](./public/assets/templates/README.md). They can be regenerated with `node scripts/capture-template-previews.mjs` while the local app and a Chrome DevTools endpoint are running.

## Material images

The original material images below do not have source and license records committed alongside them. They are retained as legacy files, but must not be used by the runtime or redistributed as licensed AURA assets:

- `public/assets/materials/american-walnut-v1.webp`
- `public/assets/materials/carrara-marble.webp`
- `public/assets/materials/nero-marquina-v1.webp`
- `public/assets/materials/roman-travertine.webp`
- `public/assets/materials/smoked-oak-v1.webp`

They have been replaced in the runtime by five new `aura-*-v2.webp` base-color textures generated specifically for AURA. Their generation record, exact material requests, processing details, and checksums are committed in [`public/assets/materials/README.md`](./public/assets/materials/README.md). The generated files are albedo only; no PBR map is implied.

## Fonts

The application bundles Manrope and Instrument Serif font files under `src/assets/fonts/`. Both upstream projects distribute the fonts under the SIL Open Font License 1.1. The required copyright notices and full license text are included in [`public/licenses/FONT-LICENSES.txt`](./public/licenses/FONT-LICENSES.txt) and ship with the deployed site.

- Manrope upstream: <https://github.com/sharanda/manrope>
- Instrument Serif upstream: <https://github.com/Instrument/instrument-serif>

## Blender concept files

The `.blend` files in `blender/templates/` and the generator in `blender/create_templates.py` are project concept/reference materials. They are not the source of the current runtime room geometry, and no standalone reuse license is declared for them.

## Application code

No general `LICENSE` file is currently present. Unless and until the rights holder adds one, do not assume the application source is open-source or available for downstream commercial reuse.

This notice records the repository's current licensing state without assigning new rights or replacing agreements held by the project owner.
