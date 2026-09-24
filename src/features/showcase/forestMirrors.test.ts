import { describe, expect, it, vi } from 'vitest';
import { Frustum, Group, LinearMipmapLinearFilter, Matrix4, Object3D, PerspectiveCamera, Scene, ShaderMaterial, Vector3, type WebGLRenderer } from 'three';
import { createForestMirrors } from './forestMirrors';

function fixture(compact = false) {
  const camera = new PerspectiveCamera(60, 1, .04, 180);
  camera.position.set(-3.45, 5.1, -2.4);
  camera.lookAt(-3.45, 4.95, -3.641);
  camera.updateMatrixWorld();
  const pond = new Object3D(), scene = new Scene();
  const helper = createForestMirrors(compact, camera, pond);
  scene.add(pond, ...helper.mirrors); scene.updateMatrixWorld(true); helper.update(false);
  const renderer = {
    getRenderTarget: vi.fn(() => null), setRenderTarget: vi.fn(),
    xr: { enabled: false }, shadowMap: { autoUpdate: false }, autoClear: true,
    state: { buffers: { depth: { setMask: vi.fn() } } }, render: vi.fn(),
  };
  const capture = () => {
    const mirror = helper.mirrors[1];
    mirror.onBeforeRender(renderer as unknown as WebGLRenderer, scene, camera, mirror.geometry, mirror.material as ShaderMaterial, new Group());
  };
  return { camera, pond, scene, helper, renderer, capture };
}

describe('Forest bathroom mirrors', () => {
  it('matches both authored front faces without replacing their original bevels', () => {
    const { helper } = fixture();
    expect(helper.mirrors.map(m => m.position.toArray())).toEqual([[-3.3, 1.55, -3.641], [-3.45, 4.95, -3.641]]);
    expect(helper.mirrors.map(m => m.name)).toEqual(['Forest lower bathroom mirror', 'Forest upper bathroom mirror']);
    helper.mirrors.forEach((mirror, i) => {
      mirror.geometry.computeBoundingBox();
      expect(mirror.geometry.boundingBox!.getSize(new Vector3()).x).toBeCloseTo(i ? .98 : .43);
      expect(mirror.geometry.boundingBox!.getSize(new Vector3()).y).toBeCloseTo(.78);
      expect(mirror.frustumCulled).toBe(true);
      expect(mirror.forceUpdate).toBe(false);
      expect((mirror.material as ShaderMaterial).fragmentShader).toContain('base.rgb * .94');
    });
    helper.dispose();
  });

  it('only enables the nearby floor in Walk, with normal frustum culling behind the visitor', () => {
    const { helper, camera } = fixture();
    expect(helper.mirrors.map(m => m.visible)).toEqual([false, true]);
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(frustum.intersectsObject(helper.mirrors[1])).toBe(true);
    camera.lookAt(-3.45, 5.1, 0); camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(frustum.intersectsObject(helper.mirrors[1])).toBe(false);
    helper.update(true); expect(helper.mirrors.every(m => !m.visible)).toBe(true);
    camera.position.set(-3.3, 1.7, -2.7); helper.update(false);
    expect(helper.mirrors.map(m => m.visible)).toEqual([true, false]);
    for (const position of [[0, 1.7, 0], [-3.3, 1.7, -4], [-3.3, 9, -2.7]]) {
      camera.position.fromArray(position); helper.update(false);
      expect(helper.mirrors.every(m => !m.visible)).toBe(true);
    }
    helper.dispose();
  });

  it('reflects the current viewpoint and excludes every planar peer during capture', () => {
    const { helper, renderer, camera, capture, pond, scene } = fixture();
    renderer.render.mockImplementation((_scene: Scene, reflected: PerspectiveCamera) => {
      expect(_scene).toBe(scene);
      expect(pond.visible).toBe(false); expect(helper.mirrors.every(m => !m.visible)).toBe(true);
      expect(reflected.position.x).toBeCloseTo(camera.position.x);
      expect(reflected.position.z).toBeCloseTo(-3.641 * 2 - camera.position.z);
      const other = helper.mirrors[0];
      other.onBeforeRender(renderer as unknown as WebGLRenderer, scene, reflected, other.geometry, other.material as ShaderMaterial, new Group());
    });
    capture(); expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(pond.visible).toBe(true); expect(helper.mirrors.map(m => m.visible)).toEqual([false, true]);
    camera.position.x += .2; camera.updateMatrixWorld(); capture();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    helper.dispose();
  });

  it('restores peer visibility even if a reflection draw fails', () => {
    const { helper, renderer, capture, pond } = fixture();
    pond.visible = false;
    renderer.render.mockImplementation(() => { throw new Error('lost context'); });
    expect(capture).toThrow('lost context');
    expect(pond.visible).toBe(false); expect(helper.mirrors.map(m => m.visible)).toEqual([false, true]);
    helper.dispose();
  });

  it.each([false, true])('bounds targets and releases each target, material and geometry (compact=%s)', compact => {
    const { helper, scene } = fixture(compact);
    const expectFiltering = () => helper.mirrors.forEach(mirror => {
      expect(mirror.getRenderTarget().texture.generateMipmaps).toBe(true);
      expect(mirror.getRenderTarget().texture.minFilter).toBe(LinearMipmapLinearFilter);
    });
    expectFiltering();
    helper.quality(true);
    expect(helper.mirrors.map(m => m.getRenderTarget().width)).toEqual([compact ? 512 : 1024, compact ? 512 : 1024]);
    expect(helper.mirrors.map(m => m.getRenderTarget().samples)).toEqual(compact ? [0, 0] : [2, 2]);
    expectFiltering();
    helper.quality(false);
    expect(helper.mirrors.map(m => m.getRenderTarget().width)).toEqual([compact ? 256 : 512, compact ? 256 : 512]);
    expect(helper.mirrors.map(m => m.getRenderTarget().samples)).toEqual([0, 0]);
    expectFiltering();
    const disposed = helper.mirrors.flatMap(mirror => [vi.spyOn(mirror.geometry, 'dispose'), vi.spyOn(mirror.material as ShaderMaterial, 'dispose'), vi.spyOn(mirror.getRenderTarget(), 'dispose')]);
    helper.dispose(); disposed.forEach(spy => expect(spy).toHaveBeenCalledOnce());
    expect(scene.children).toHaveLength(1);
  });
});
