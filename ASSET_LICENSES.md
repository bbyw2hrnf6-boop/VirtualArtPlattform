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

The three images in `public/assets/templates/` are AURA-specific concept-direction images generated with OpenAI ImageGen on 2026-08-04. Their role, prompts' visual intent, dimensions, and checksums are recorded in [`public/assets/templates/README.md`](./public/assets/templates/README.md). They are disclosed as concept imagery in the UI and are not presented as captures of the live builder.

## Material images

Unlicensed legacy material images and superseded generated variants were removed from the repository. The runtime uses only the AURA-generated base-color textures documented with generation records and checksums in [`public/assets/materials/README.md`](./public/assets/materials/README.md). The generated files are albedo only; no PBR map is implied.

## Fonts

The application bundles Manrope and Instrument Serif font files under `src/assets/fonts/`. Both upstream projects distribute the fonts under the SIL Open Font License 1.1. The required copyright notices and full license text are included in [`public/licenses/FONT-LICENSES.txt`](./public/licenses/FONT-LICENSES.txt) and ship with the deployed site.

- Manrope upstream: <https://github.com/sharanda/manrope>
- Instrument Serif upstream: <https://github.com/Instrument/instrument-serif>

## Blender concept files

The `.blend` files in `blender/templates/` and the generator in `blender/create_templates.py` are project concept/reference materials. They are not the source of the current runtime room geometry, and no standalone reuse license is declared for them.

## Application code

No general `LICENSE` file is currently present. Unless and until the rights holder adds one, do not assume the application source is open-source or available for downstream commercial reuse.

This notice records the repository's current licensing state without assigning new rights or replacing agreements held by the project owner.
