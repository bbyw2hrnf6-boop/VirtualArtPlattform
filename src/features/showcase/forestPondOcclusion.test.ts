import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { installForestPondOcclusion } from './forestPondOcclusion';

describe('Forest pond occlusion', () => {
  it('avoids hidden captures, resumes on the first visible query, and cleans up', () => {
    const pond = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const scene = new Scene(), camera = new PerspectiveCamera(), otherCamera = new PerspectiveCamera();
    const renderReflection = vi.fn();
    pond.onBeforeRender = renderReflection;
    const queries: { ready: boolean; visible: boolean }[] = [];
    const gl = {
      ANY_SAMPLES_PASSED: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
      createQuery: vi.fn(() => { const query = { ready: false, visible: true }; queries.push(query); return query; }),
      beginQuery: vi.fn(), endQuery: vi.fn(), deleteQuery: vi.fn(),
      getQueryParameter: vi.fn((query: typeof queries[number], key: number) => key === 2 ? query.ready : query.visible),
    } as unknown as WebGL2RenderingContext;
    const renderer = {} as WebGLRenderer, group = new Group();
    const draw = (view = camera) => {
      pond.onBeforeRender(renderer, scene, view, pond.geometry, pond.material, group);
      pond.onAfterRender(renderer, scene, view, pond.geometry, pond.material, group);
    };
    const dispose = installForestPondOcclusion(pond, gl, camera);
    draw();
    expect(renderReflection).toHaveBeenCalledTimes(1);
    expect(gl.beginQuery).toHaveBeenCalledTimes(1);
    expect(gl.endQuery).toHaveBeenCalledTimes(1);
    queries[0].ready = true; queries[0].visible = false;
    draw();
    expect(renderReflection).toHaveBeenCalledTimes(1);
    draw(otherCamera);
    expect(renderReflection).toHaveBeenCalledTimes(2);
    expect(gl.beginQuery).toHaveBeenCalledTimes(2);
    queries[1].ready = true; queries[1].visible = true;
    draw();
    expect(renderReflection).toHaveBeenCalledTimes(3);
    dispose();
    expect(pond.onBeforeRender).toBe(renderReflection);
    expect(gl.deleteQuery).toHaveBeenCalledTimes(3);
  });
});
