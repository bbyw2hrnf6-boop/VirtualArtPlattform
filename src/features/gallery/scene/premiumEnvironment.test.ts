import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { getTemplate } from '../templates';
import { galleryWalls } from '../editor/placementValidation';
import { createGalleryDraft } from '../editor/draftDefaults';
import { attachPremiumEnvironment, premiumEnvironmentRequested, validatePremiumEnvironment } from './premiumEnvironment';
import { planarCollidersFromObjects } from './runtimeQuality';
import type { TemplateId } from '../types';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn() }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { loadAsync = loadAsync; },
}));
const sides = ['north', 'south', 'west', 'east'] as const;
const templates = ['white-cube', 'nocturne', 'pavilion'] as const;

function deferredAsset() {
  let resolve!: (value: { scene: THREE.Group }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ scene: THREE.Group }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function authoredFixture(id: TemplateId = 'white-cube') {
  const root = new THREE.Group(), template = getTemplate(id);
  root.userData = { aura_template_id: id, aura_schema_version: 2, aura_units: 'metres',
    lieuva_production_version: 'premium-v3', aura_dimensions: [...template.dimensions, template.height] };
  for (const wall of galleryWalls(id)) {
    const node = new THREE.Object3D(); node.userData = { aura_role: 'surface', aura_surface_id: wall }; root.add(node);
  }
  for (const role of ['navmesh', 'art-anchor', 'view', 'walk-start', 'walk-look']) {
    const node = new THREE.Object3D(); node.userData.aura_role = role; root.add(node);
  }
  const mesh = (name: string, role: string, size: [number, number, number] = [1, 1, 1]) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    object.name = name; object.userData.aura_role = role; root.add(object); return object;
  };
  const shells = sides.map((side, index) => {
    const object = mesh(`SHELL_${side}`, 'shell'); object.userData.aura_surface_id = side;
    object.position.set(index + 1, 2, -3); object.rotation.y = index * Math.PI / 2; return object;
  });
  const floor = mesh('SHELL_Floor', 'floor', [16, .2, 12]); floor.position.y = -.1;
  const collider = mesh('COLLIDER_Block', 'collider', [1, 1.5, 1]); collider.position.y = .75;
  collider.userData.aura_collision = 'solid';
  const cosmetic = mesh('Merged cosmetic batch', 'architecture', [12, 2, 10]); cosmetic.position.y = 1;
  const overhead = mesh('OVERHEAD_Ceiling', 'ceiling', [16, .2, 12]); overhead.position.y = template.height;
  overhead.userData.lieuva_overhead = true; overhead.material.userData.surfaceRole = 'ceiling';
  return { root, shells, floor, collider, cosmetic, overhead };
}

function hostFixture(id: TemplateId = 'white-cube', mobile = false) {
  const scene = new THREE.Scene(), architecture = new THREE.Group();
  const originalArchitecture = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial());
  const exitSign = new THREE.Object3D(); exitSign.userData.exitSign = true;
  architecture.add(originalArchitecture, exitSign);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshPhysicalMaterial()); floor.rotation.x = -Math.PI / 2;
  const exteriorWalls = sides.map((side, index) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), new THREE.MeshPhysicalMaterial());
    wall.userData.wallId = side; wall.position.set(index - 2, 2.5, 6); wall.rotation.y = index * Math.PI / 2; return wall;
  });
  scene.add(architecture, floor, ...exteriorWalls);
  const element = { dataset: {} } as HTMLElement;
  const disposeTree = vi.fn((root: THREE.Object3D) => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  });
  const options = { templateId: id, mobile, element, floor, exteriorWalls, architecture,
    roof: new THREE.Mesh(), ceiling: new THREE.Mesh(), ceilingDetails: new THREE.Group(),
    prepareMaterial: vi.fn<(material: THREE.MeshPhysicalMaterial) => void>(),
    onReady: vi.fn(), onSettled: vi.fn(), disposeTree };
  const originals = [floor, ...exteriorWalls].map((object) => ({ object,
    geometry: object.geometry, material: object.material,
    position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
  const expectUnchanged = () => {
    for (const original of originals) {
      expect(original.object.geometry).toBe(original.geometry); expect(original.object.material).toBe(original.material);
      expect(original.object.position.toArray()).toEqual(original.position.toArray()); expect(original.object.quaternion.toArray()).toEqual(original.quaternion.toArray());
      expect(original.object.scale).toEqual(original.scale);
    }
    expect(architecture.children).toEqual([originalArchitecture, exitSign]); expect(originalArchitecture.parent).toBe(architecture);
  };
  return { options, scene, originals, originalArchitecture, exitSign, expectUnchanged };
}

beforeEach(() => { loadAsync.mockReset(); });

describe('authored environment boundary', () => {
  it('defaults Studio and visitor URLs to premium with an explicit procedural rollback', () => {
    for (const search of ['', '?environment=premium-v3', '?environment=premium-v1', '?environment=unknown'])
      expect(premiumEnvironmentRequested(search)).toBe(true);
    expect(premiumEnvironmentRequested('?environment=procedural')).toBe(false);
    expect(premiumEnvironmentRequested('?other=1&environment=procedural')).toBe(false);
  });
  it.each(templates)('accepts the protected v2 %s contract', (id) => {
    expect(() => validatePremiumEnvironment(authoredFixture(id).root, id)).not.toThrow();
  });
  it('rejects old versions, missing/duplicate surfaces, wrong dimensions and beauty staging', () => {
    const old = authoredFixture(); old.root.userData.lieuva_production_version = 'premium-v1';
    expect(() => validatePremiumEnvironment(old.root, 'white-cube')).toThrow(/metadata/);
    const missing = authoredFixture('pavilion'); missing.root.remove(missing.root.children[4]);
    expect(() => validatePremiumEnvironment(missing.root, 'pavilion')).toThrow(/surface/);
    const duplicate = authoredFixture(); duplicate.root.add(duplicate.root.children[0].clone());
    expect(() => validatePremiumEnvironment(duplicate.root, 'white-cube')).toThrow(/surface/);
    const wrong = authoredFixture('nocturne'); wrong.root.userData.aura_dimensions = [16, 12, 5.3];
    expect(() => validatePremiumEnvironment(wrong.root, 'nocturne')).toThrow(/dimensions/);
    const staged = authoredFixture(); staged.cosmetic.userData.lieuva_beauty_only = true;
    expect(() => validatePremiumEnvironment(staged.root, 'white-cube')).toThrow(/staging/);
  });
});

describe('asynchronous premium attachment', () => {
  it.each(templates)('keeps the %s room intact until loading completes and selects the requested tier', async (id) => {
    const asset = authoredFixture(id), host = hostFixture(id, id === 'nocturne'), pending = deferredAsset();
    loadAsync.mockReturnValue(pending.promise);
    const handle = attachPremiumEnvironment(host.options);
    host.expectUnchanged(); expect(handle.loaded).toBe(false);
    expect(host.options.element.dataset.captureReady).toBe('false'); expect(host.options.onReady).not.toHaveBeenCalled();
    expect(loadAsync).toHaveBeenCalledWith(expect.stringContaining(
      `/assets/templates/premium-v3/${id}-${id === 'nocturne' ? 'mobile' : 'desktop'}.glb`), expect.any(Function));
    pending.resolve({ scene: asset.root }); await handle.ready;
    expect(handle.loaded).toBe(true);
    expect(host.options.element.dataset).toMatchObject({ environment: 'premium-v3', captureReady: 'false' });
    expect(host.options.onReady).toHaveBeenCalledOnce(); expect(host.options.onSettled).toHaveBeenCalledOnce();
    expect(host.options.architecture.children).toContain(host.exitSign);
    expect(host.options.architecture.children).not.toContain(host.originalArchitecture);
    expect(host.options.disposeTree.mock.calls.filter(([root]) => root === asset.root)).toHaveLength(1);
    expect(asset.root.parent).toBeNull(); handle.dispose();
  });

  it.each(['missing', 'extra', 'duplicate', 'replaced-id', 'missing-id', 'empty-id'] as const)('rejects a %s shell without mutating the room', async (invalid) => {
    const asset = authoredFixture(), host = hostFixture(), pending = deferredAsset();
    if (invalid === 'missing') asset.root.remove(asset.shells[3]);
    if (invalid === 'extra' || invalid === 'duplicate') {
      const extra = asset.shells[3].clone(); extra.userData.aura_surface_id = invalid === 'extra' ? 'surprise' : 'east'; asset.root.add(extra);
    }
    if (invalid === 'replaced-id') asset.shells[3].userData.aura_surface_id = 'surprise';
    if (invalid === 'missing-id' || invalid === 'empty-id') {
      const extra = asset.shells[3].clone();
      if (invalid === 'missing-id') delete extra.userData.aura_surface_id;
      else extra.userData.aura_surface_id = '';
      asset.root.add(extra);
    }
    const preparedDisposals: ReturnType<typeof vi.fn>[] = [];
    host.options.prepareMaterial.mockImplementation((material) => {
      const dispose = vi.fn(); material.addEventListener('dispose', dispose); preparedDisposals.push(dispose);
    });
    loadAsync.mockReturnValue(pending.promise);
    const handle = attachPremiumEnvironment(host.options);
    pending.resolve({ scene: asset.root }); await handle.ready;
    host.expectUnchanged(); expect(handle.loaded).toBe(false);
    expect(host.options.element.dataset).toMatchObject({ environment: 'procedural-fallback', captureReady: 'false' });
    expect(host.options.element.dataset.environmentError).toMatch(/shell/i);
    expect(host.options.onReady).not.toHaveBeenCalled(); expect(host.options.onSettled).toHaveBeenCalledOnce();
    expect(host.options.disposeTree.mock.calls.filter(([root]) => root === asset.root)).toHaveLength(1);
    for (const dispose of preparedDisposals) expect(dispose).toHaveBeenCalledOnce();
  });

  it('disposes prepared replacements if material preparation fails before the swap', async () => {
    const asset = authoredFixture(), host = hostFixture();
    const preparedDisposals: ReturnType<typeof vi.fn>[] = [];
    host.options.prepareMaterial.mockImplementation((material) => {
      const dispose = vi.fn(); material.addEventListener('dispose', dispose); preparedDisposals.push(dispose);
      if (preparedDisposals.length === 4) throw new Error('Material preparation failed');
    });
    loadAsync.mockResolvedValue({ scene: asset.root });
    const handle = attachPremiumEnvironment(host.options); await handle.ready;
    host.expectUnchanged(); expect(handle.loaded).toBe(false);
    expect(host.options.element.dataset.environment).toBe('procedural-fallback');
    expect(host.options.element.dataset.environmentError).toBe('Material preparation failed');
    expect(preparedDisposals).toHaveLength(4);
    for (const dispose of preparedDisposals) expect(dispose).toHaveBeenCalledOnce();
    expect(host.options.onReady).not.toHaveBeenCalled(); expect(host.options.onSettled).toHaveBeenCalledOnce();
  });

  it('recovers from a rejected load without changing room geometry or firing onReady', async () => {
    const host = hostFixture(), pending = deferredAsset(); loadAsync.mockReturnValue(pending.promise);
    const handle = attachPremiumEnvironment(host.options);
    pending.reject(new Error('Download failed')); await handle.ready;
    host.expectUnchanged();
    expect(host.options.element.dataset).toMatchObject({ environment: 'procedural-fallback', environmentError: 'Download failed', captureReady: 'false' });
    expect(host.options.onReady).not.toHaveBeenCalled(); expect(host.options.onSettled).toHaveBeenCalledOnce();
  });

  it('preserves authored AO on UV1 and world geometry while retaining editor transforms', async () => {
    const asset = authoredFixture(), host = hostFixture();
    asset.root.position.set(3, .2, -2); asset.root.rotation.y = .3;
    const source = asset.shells[2];
    source.material.map = new THREE.Texture(); source.material.map.repeat.set(2, 3);
    source.material.aoMap = new THREE.Texture(); source.material.aoMap.channel = 1;
    source.material.normalMap = new THREE.Texture(); source.material.normalScale.set(.3, .4);
    source.material.transparent = true; source.material.opacity = .6; source.material.side = THREE.DoubleSide;
    const sourceAoDisposed = vi.spyOn(source.material.aoMap, 'dispose');
    loadAsync.mockResolvedValue({ scene: asset.root });
    const handle = attachPremiumEnvironment(host.options); await handle.ready;
    const target = host.options.exteriorWalls[2], material = target.material;
    expect(material.aoMap).not.toBeNull(); expect(material.aoMap).not.toBe(source.material.aoMap);
    expect(material.aoMap?.channel).toBe(1); expect(material.aoMapIntensity).toBeGreaterThan(0);
    expect(material.map).not.toBe(source.material.map); expect(material.map?.repeat.toArray()).toEqual([2, 3]);
    expect(material.normalScale.toArray()).toEqual([.3, .4]);
    expect(material.transparent).toBe(true); expect(material.opacity).toBe(.6); expect(material.side).toBe(THREE.DoubleSide);
    expect(sourceAoDisposed).toHaveBeenCalledOnce();
    expect(target.geometry.getAttribute('uv1').array).toEqual(source.geometry.getAttribute('uv1').array);
    for (const original of host.originals) {
      expect(original.object.position.toArray()).toEqual(original.position.toArray()); expect(original.object.quaternion.toArray()).toEqual(original.quaternion.toArray());
      expect(original.object.scale).toEqual(original.scale);
    }
    host.scene.updateMatrixWorld(true); asset.root.updateMatrixWorld(true);
    const sources = [asset.floor, ...asset.shells], targets = [host.options.floor, ...host.options.exteriorWalls];
    for (let meshIndex = 0; meshIndex < sources.length; meshIndex++) {
      const from = sources[meshIndex], to = targets[meshIndex];
      for (let i = 0; i < from.geometry.getAttribute('position').count; i++) {
        const expected = new THREE.Vector3().fromBufferAttribute(from.geometry.getAttribute('position'), i).applyMatrix4(from.matrixWorld);
        const actual = new THREE.Vector3().fromBufferAttribute(to.geometry.getAttribute('position'), i).applyMatrix4(to.matrixWorld);
        expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
      }
    }
    handle.dispose();
  });

  it('keeps hidden colliders active and excludes merged cosmetic geometry from Walk collision', async () => {
    const asset = authoredFixture(), host = hostFixture(); loadAsync.mockResolvedValue({ scene: asset.root });
    const handle = attachPremiumEnvironment(host.options); await handle.ready;
    const collider = host.options.architecture.getObjectByName(asset.collider.name)!;
    const cosmetic = host.options.architecture.getObjectByName(asset.cosmetic.name)!;
    expect(collider.visible).toBe(false); expect(collider.userData.noWalkCollision).toBe(false);
    expect(cosmetic.visible).toBe(true); expect(cosmetic.userData.noWalkCollision).toBe(true);
    expect(planarCollidersFromObjects([host.options.architecture])).toEqual([
      expect.objectContaining({ name: asset.collider.name, minX: -.5, maxX: .5, minZ: -.5, maxZ: .5 }),
    ]);
    handle.apply(true, createGalleryDraft('white-cube'));
    expect(host.options.architecture.getObjectByName(asset.overhead.name)?.visible).toBe(false);
    expect(collider.visible).toBe(false); expect(planarCollidersFromObjects([host.options.architecture])).toHaveLength(1);
    handle.dispose();
  });

  it('disposes a late asset without mutating or calling back into a disposed host', async () => {
    const asset = authoredFixture(), host = hostFixture(), pending = deferredAsset();
    const sourceDisposed = vi.spyOn(asset.floor.geometry, 'dispose'); loadAsync.mockReturnValue(pending.promise);
    const handle = attachPremiumEnvironment(host.options); handle.dispose();
    const statusAtDisposal = { ...host.options.element.dataset };
    pending.resolve({ scene: asset.root }); await handle.ready;
    host.expectUnchanged(); expect(handle.loaded).toBe(false);
    expect(host.options.element.dataset).toEqual(statusAtDisposal);
    expect(host.options.prepareMaterial).not.toHaveBeenCalled();
    expect(host.options.onReady).not.toHaveBeenCalled(); expect(host.options.onSettled).not.toHaveBeenCalled();
    expect(sourceDisposed).toHaveBeenCalledOnce();
    expect(host.options.disposeTree.mock.calls.filter(([root]) => root === asset.root)).toHaveLength(1);
  });

  it.each(templates)('switches %s authored/custom ceilings and cutaway without rebuilding', async (id) => {
    const asset = authoredFixture(id), host = hostFixture(id), pending = deferredAsset(); loadAsync.mockReturnValue(pending.promise);
    const handle = attachPremiumEnvironment(host.options), draft = createGalleryDraft(id);
    handle.apply(true, draft); expect(host.options.roof.visible).toBe(true);
    pending.resolve({ scene: asset.root }); await handle.ready;
    const overhead = host.options.architecture.getObjectByName(asset.overhead.name) as THREE.Mesh, authoredMaterial = overhead.material;
    const assertVisibility = (authored: boolean, procedural: boolean) => {
      expect(host.options.roof.visible).toBe(false); expect(overhead.visible).toBe(authored);
      expect(host.options.ceiling.visible).toBe(procedural); expect(host.options.ceilingDetails.visible).toBe(procedural);
    };
    handle.apply(false, draft); assertVisibility(true, false);
    const custom = { ...draft, ceiling: 'vaulted' as const };
    handle.apply(false, custom); assertVisibility(false, true);
    handle.apply(true, custom); assertVisibility(false, false);
    handle.apply(true, draft); assertVisibility(false, false);
    handle.apply(false, draft); assertVisibility(true, false);
    expect(overhead.material).toBe(authoredMaterial);
    expect((authoredMaterial as THREE.Material).userData.surfaceRole).toBeUndefined();
    expect(asset.overhead.material.userData.surfaceRole).toBe('ceiling'); expect(loadAsync).toHaveBeenCalledOnce();
    handle.dispose();
  });
});
