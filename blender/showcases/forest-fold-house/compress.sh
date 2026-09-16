#!/bin/sh
# Build-only CLI must be @gltf-transform/cli 4.5.0. Set GLTF_TRANSFORM to its executable.
set -eu
cd "$(dirname "$0")/../../.."
cli="${GLTF_TRANSFORM:-gltf-transform}"
[ "$("$cli" --version)" = "4.5.0" ] || { echo 'Need gltf-transform 4.5.0'; exit 1; }
mkdir -p artifacts/forest/raw
for tier in desktop mobile; do
  name="forest-fold-house-$tier.glb"
  mv "public/assets/showcases/forest-fold-house/$name" "artifacts/forest/raw/$name"
  "$cli" meshopt "artifacts/forest/raw/$name" "public/assets/showcases/forest-fold-house/$name" --quantize-position 16 --quantize-texcoord 14
done
