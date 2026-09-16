#!/bin/sh
# Build-only tool from the public npm registry; source geometry stays in Blender.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
mkdir -p "$ROOT/artifacts/sculpture/uncompressed"
for tier in desktop mobile; do
  asset="sculpture-pavilion-$tier.glb"
  cp "$ROOT/public/assets/showcases/sculpture-pavilion/$asset" "$ROOT/artifacts/sculpture/uncompressed/$asset"
  npm exec --yes --package=@gltf-transform/cli@4.5.0 -- gltf-transform meshopt "$ROOT/artifacts/sculpture/uncompressed/$asset" "$ROOT/public/assets/showcases/sculpture-pavilion/$asset" --quantize-texcoord 16 --quantize-position 16
done
