import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { publicAssetUrl } from '../../../services/publicAssetUrl';
import { getTemplate } from '../templates';
import { galleryWalls } from '../editor/placementValidation';
import type { GalleryDraft, TemplateId } from '../types';

export const PREMIUM_ENVIRONMENT_VERSION = 'premium-v3';

/** Shared Studio/visitor default. The explicit procedural selector is a local rollback. */
export function premiumEnvironmentRequested(search: string) {
  return new URLSearchParams(search).get('environment') !== 'procedural';
}

export function validatePremiumEnvironment(root: THREE.Group, templateId: TemplateId) {
  const expected = getTemplate(templateId);
  const metadata = root.userData;
  if (metadata.aura_template_id !== templateId || metadata.aura_schema_version !== 2 ||
      metadata.aura_units !== 'metres' || metadata.lieuva_production_version !== PREMIUM_ENVIRONMENT_VERSION)
    throw new Error('The authored environment metadata does not match this template.');
  if (JSON.stringify(metadata.aura_dimensions) !== JSON.stringify([...expected.dimensions, expected.height]))
    throw new Error('The authored environment dimensions do not match Studio.');
  const surfaces: string[] = [];
  const roles = new Map<string, number>();
  root.traverse((object) => {
    const role = object.userData.aura_role;
    if (role) roles.set(role, (roles.get(role) ?? 0) + 1);
    if (role === 'surface') surfaces.push(object.userData.aura_surface_id);
    if (role === 'beauty' || object.userData.lieuva_beauty_only)
      throw new Error('Beauty staging must not enter the runtime.');
  });
  if (JSON.stringify(surfaces.sort()) !== JSON.stringify(galleryWalls(templateId).sort()))
    throw new Error('The authored environment is missing a protected placement surface.');
  for (const role of ['collider', 'navmesh', 'floor', 'art-anchor', 'view'])
    if (!roles.has(role)) throw new Error(`Missing authored ${role}.`);
  for (const role of ['walk-start', 'walk-look'])
    if (roles.get(role) !== 1) throw new Error(`Expected one ${role}.`);
}

/** Copy every Standard property, including AO/UV channel and alpha/normal state.
 * Texture objects are owned by the mounted scene, separately from the loader. */
export function premiumPhysicalMaterial(source: THREE.Material) {
  if (!(source instanceof THREE.MeshStandardMaterial))
    throw new Error('Authored visible surfaces require a PBR material.');
  const result = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(result, source);
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof THREE.Texture) Reflect.set(result, key, value.clone());
  }
  result.userData = { ...source.userData, metricUv: true };
  result.aoMapIntensity = 0.75;
  // The original authored ceiling is restored when its default finish is chosen.
  // User ceiling presets operate on the existing editable ceiling system.
  if (result.userData.surfaceRole === 'ceiling') delete result.userData.surfaceRole;
  return result;
}

/** Retain the host mesh transform: wall raycasting and editor tools own its axes. */
export function premiumGeometryInTargetSpace(source: THREE.Mesh, target: THREE.Object3D) {
  source.updateWorldMatrix(true, false);
  target.updateWorldMatrix(true, false);
  const transform = target.matrixWorld.clone().invert().multiply(source.matrixWorld);
  return source.geometry.clone().applyMatrix4(transform);
}

export type PremiumEnvironmentHandle = {
  readonly loaded: boolean;
  readonly ready: Promise<void>;
  apply: (cutaway: boolean, draft: GalleryDraft) => void;
  dispose: () => void;
};

type Options = {
  requestKey?: string;
  templateId: TemplateId;
  mobile: boolean;
  element: HTMLElement;
  floor: THREE.Mesh;
  exteriorWalls: THREE.Mesh[];
  architecture: THREE.Group;
  roof: THREE.Mesh;
  ceiling: THREE.Mesh;
  ceilingDetails: THREE.Group;
  prepareMaterial: (material: THREE.MeshPhysicalMaterial) => void;
  onReady: () => void;
  onSettled: () => void;
  onProgress?: (progress: number) => void;
  disposeTree: (root: THREE.Object3D) => void;
};

/** Swap only room assets; camera, artwork, selection and persistence stay in Studio. */
export function attachPremiumEnvironment(options: Options): PremiumEnvironmentHandle {
  const { templateId, element, architecture } = options;
  let disposed = false;
  let loaded = false;
  const startedAt = performance.now();
  const retained = new THREE.Group();
  const prepared = new THREE.Group();
  const overhead: THREE.Object3D[] = [];
  const defaultCeiling = templateId === 'white-cube' ? 'gallery' : templateId === 'nocturne' ? 'dark' : 'skylight';
  const apply = (cutaway: boolean, draft: GalleryDraft) => {
    if (!loaded) return;
    const authoredCeiling = (draft.ceiling ?? 'gallery') === defaultCeiling;
    options.roof.visible = false;
    options.ceiling.visible = options.ceilingDetails.visible = !cutaway && !authoredCeiling;
    overhead.forEach((object) => { object.visible = !cutaway && authoredCeiling; });
  };
  element.dataset.environment = 'premium-loading';
  element.dataset.captureReady = 'false';
  delete element.dataset.environmentError;
  const path = publicAssetUrl(`assets/templates/${PREMIUM_ENVIRONMENT_VERSION}/${templateId}-${options.mobile ? 'mobile' : 'desktop'}.glb`);
  const requestPath = options.requestKey ? `${path}?arrival=${encodeURIComponent(options.requestKey)}` : path;
  const ready = new GLTFLoader().loadAsync(requestPath, (event) => {
    if (event.total && !disposed) options.onProgress?.(event.loaded / event.total * 100);
  }).then((gltf) => {
    const asset = gltf.scene;
    try {
      if (disposed) return;
      validatePremiumEnvironment(asset, templateId);
      asset.updateMatrixWorld(true);
      const shells = new Map<string, THREE.Mesh>();
      const additions: THREE.Mesh[] = [];
      asset.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const role = object.userData.aura_role;
        const shellId = role === 'shell' ? object.userData.aura_surface_id : role === 'floor' ? 'floor' : undefined;
        if (role === 'shell' && !['north', 'south', 'west', 'east'].includes(shellId))
          throw new Error('Unexpected authored shell.');
        if (shellId) {
          if (shells.has(shellId)) throw new Error(`Duplicate authored shell ${shellId}.`);
          shells.set(shellId, object);
        } else if (role === 'architecture' || role === 'ceiling' || role === 'collider') additions.push(object);
      });
      if (shells.size !== 5) throw new Error('Unexpected authored shell.');
      const shellSwaps: Array<{ target: THREE.Mesh; replacement: THREE.Mesh }> = [];
      for (const key of ['north', 'south', 'west', 'east', 'floor']) {
        const source = shells.get(key);
        const target = key === 'floor' ? options.floor : options.exteriorWalls.find((wall) => wall.userData.wallId === key);
        if (!source || !target) throw new Error(`Missing authored shell ${key}.`);
        const material = premiumPhysicalMaterial(source.material as THREE.Material);
        const replacement = new THREE.Mesh(premiumGeometryInTargetSpace(source, target), material);
        prepared.add(replacement);
        material.userData.surfaceRole = key === 'floor' ? 'floor' : 'wall';
        options.prepareMaterial(material);
        shellSwaps.push({ target, replacement });
      }
      const materials = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
      for (const mesh of additions) {
        const collider = mesh.userData.aura_role === 'collider';
        const source = mesh.material as THREE.Material;
        let material: THREE.Material | undefined = collider ? new THREE.MeshBasicMaterial() : materials.get(source);
        if (!material) {
          const physical = premiumPhysicalMaterial(source);
          if (mesh.userData.lieuva_overhead && physical.userData.surfaceRole === 'floor')
            delete physical.userData.surfaceRole;
          material = physical; materials.set(source, physical);
        }
        const clone = new THREE.Mesh(premiumGeometryInTargetSpace(mesh, architecture), material);
        prepared.add(clone);
        if (!collider) options.prepareMaterial(material as THREE.MeshPhysicalMaterial);
        clone.name = mesh.name;
        // Never derive walk collision from the AABB of a merged cosmetic batch.
        clone.userData = { ...mesh.userData, noWalkCollision: !collider };
        if (!collider && !mesh.userData.lieuva_overhead && material.userData.surfaceRole === 'wall')
          clone.userData.roomPartition = true;
        clone.visible = !collider;
        const emissive = material instanceof THREE.MeshStandardMaterial && material.emissiveIntensity > 0 && material.emissive.getHex() !== 0;
        clone.castShadow = !collider && !emissive && (!mesh.userData.lieuva_overhead || templateId !== 'nocturne');
        clone.receiveShadow = !collider;
        if (mesh.userData.lieuva_overhead) overhead.push(clone);
      }
      // All loading, validation and allocations succeeded before touching the room.
      for (const child of [...architecture.children]) if (!child.userData.exitSign) retained.add(child);
      for (const { target, replacement } of shellSwaps) {
        retained.add(new THREE.Mesh(target.geometry, target.material));
        target.geometry = replacement.geometry; target.material = replacement.material;
        target.castShadow = false;
        prepared.remove(replacement);
      }
      for (const child of [...prepared.children]) architecture.add(child);
      loaded = true;
      element.dataset.environment = PREMIUM_ENVIRONMENT_VERSION;
      element.dataset.environmentAsset = path;
      element.dataset.environmentTier = options.mobile ? 'mobile' : 'desktop';
      options.onReady();
      options.disposeTree(retained);
      retained.clear();
    } finally {
      // Loader helpers stay off-scene and cannot enter reflection/material scans.
      options.disposeTree(asset);
    }
  }).catch((error: unknown) => {
    options.disposeTree(prepared);
    if (disposed) return;
    element.dataset.environment = loaded ? PREMIUM_ENVIRONMENT_VERSION : 'procedural-fallback';
    element.dataset.environmentError = error instanceof Error ? error.message : 'Environment unavailable';
  }).finally(() => {
    if (disposed) return;
    element.dataset.environmentReadyMs = String(Math.round(performance.now() - startedAt));
    options.onSettled();
  });
  return { get loaded() { return loaded; }, ready, apply, dispose: () => {
    disposed = true;
    options.disposeTree(retained);
    // Mounted replacements are owned/disposed by GalleryScene exactly as before.
  } };
}
