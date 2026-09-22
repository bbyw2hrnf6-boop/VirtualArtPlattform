#!/bin/sh
# Build-only CLI must be @gltf-transform/cli 4.5.0. Set GLTF_TRANSFORM to its executable.
set -eu
cd "$(dirname "$0")/../../.."
cli="${GLTF_TRANSFORM:-gltf-transform}"
[ "$("$cli" --version)" = "4.5.0" ] || { echo 'Need gltf-transform 4.5.0'; exit 1; }
mkdir -p artifacts/forest/instanced public/assets/showcases/forest-fold-house/desktop-v3
for tier in desktop mobile; do
  name="forest-fold-house-$tier.glb"
  "$cli" instance "artifacts/forest/raw/$name" "artifacts/forest/instanced/$name"
  output="public/assets/showcases/forest-fold-house/$name"
  if [ "$tier" = desktop ]; then
    # External images preserve every texel while keeping each Git blob below
    # 100 MiB. A versioned directory also invalidates immutable dependency URLs.
    output="public/assets/showcases/forest-fold-house/desktop-v3/forest-fold-house-desktop.gltf"
  fi
  "$cli" meshopt "artifacts/forest/instanced/$name" "$output" --quantize-position 16 --quantize-texcoord 14
done
