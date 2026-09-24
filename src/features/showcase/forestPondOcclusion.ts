import * as THREE from 'three';

/** Reuse the pond's last image only while its surface is hidden by opaque geometry. */
export function installForestPondOcclusion(
  pond: THREE.Mesh,
  gl: WebGL2RenderingContext,
  mainCamera: THREE.Camera,
): () => void {
  if (!gl.createQuery || !gl.beginQuery || !gl.getQueryParameter) return () => {};
  const before = pond.onBeforeRender;
  const after = pond.onAfterRender;
  const pending: WebGLQuery[] = [];
  let active: WebGLQuery | null = null;
  let visible = true;

  pond.onBeforeRender = function (...args) {
    if (args[2] !== mainCamera) return before.apply(this, args);
    // Results are read only once the GPU has finished: never stall a walking frame.
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = pending.shift()!;
      visible = Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT));
      gl.deleteQuery(query);
    }
    if (visible) before.apply(this, args);
    // The pond is transparent and renders after opaque walls/floors. Its depth
    // test tells us whether even one water pixel reaches the screen.
    // Do not build an unbounded queue if a driver stops returning results.
    active = pending.length < 4 ? gl.createQuery() : null;
    if (active) {
      gl.beginQuery(gl.ANY_SAMPLES_PASSED, active);
      pending.push(active);
    } else if (!visible) {
      // A failed query must never leave a permanently stale visible pond.
      visible = true;
      before.apply(this, args);
    }
  };
  pond.onAfterRender = function (...args) {
    if (args[2] === mainCamera && active) {
      gl.endQuery(gl.ANY_SAMPLES_PASSED);
      active = null;
    }
    after.apply(this, args);
  };
  return () => {
    pond.onBeforeRender = before;
    pond.onAfterRender = after;
    for (const query of pending) gl.deleteQuery(query);
    pending.length = 0;
  };
}
