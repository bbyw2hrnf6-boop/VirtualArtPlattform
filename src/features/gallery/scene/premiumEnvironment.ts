import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { publicAssetUrl } from '../../../services/publicAssetUrl';
import { getTemplate } from '../templates';
import { galleryWalls } from '../editor/placementValidation';
import type { GalleryDraft, TemplateId } from '../types';

/** Explicit review mode; never silently changes the environment of published work. */
export function premiumEnvironmentRequested(search: string) {
  return new URLSearchParams(search).get('environment') === 'premium-v1';
}

export function validatePremiumEnvironment(root: THREE.Group, templateId: TemplateId) {
  const expected = getTemplate(templateId);
  const metadata = root.userData;
  if (metadata.aura_template_id !== templateId || metadata.aura_schema_version !== 2 ||
      metadata.aura_units !== 'metres' || metadata.lieuva_production_version !== 'premium-v1')
    throw new Error('The authored environment metadata does not match this template.');
  if (JSON.stringify(metadata.aura_dimensions) !== JSON.stringify([...expected.dimensions, expected.height]))
    throw new Error('The authored environment dimensions do not match Studio.');
  const surfaces: string[] = [];
  const roles = new Map<string, number>();
  root.traverse((object) => {
    const role = object.userData.aura_role;
    if (role) roles.set(role, (roles.get(role) ?? 0) + 1);
    if (role === 'surface') surfaces.push(object.userData.aura_surface_id);
    if (role === 'beauty') throw new Error('Beauty staging must not enter the runtime.');
  });
  if (JSON.stringify(surfaces.sort()) !== JSON.stringify(galleryWalls(templateId).sort()))
    throw new Error('The authored environment is missing a protected placement surface.');
  for (const role of ['collider', 'navmesh', 'floor', 'art-anchor', 'view'])
    if (!roles.has(role)) throw new Error(`Missing authored ${role}.`);
  for (const role of ['walk-start', 'walk-look'])
    if (roles.get(role) !== 1) throw new Error(`Expected one ${role}.`);
}

function physicalMaterial(source: THREE.MeshStandardMaterial) {
  const result = new THREE.MeshPhysicalMaterial({
    name: source.name, color: source.color, map: source.map,
    roughness: source.roughness, metalness: source.metalness,
    emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
    emissiveMap: source.emissiveMap, normalMap: source.normalMap,
    roughnessMap: source.roughnessMap, metalnessMap: source.metalnessMap,
  });
  result.userData = { ...source.userData };
  return result;
}

export type PremiumEnvironmentHandle = {
  apply: (cutaway: boolean, draft: GalleryDraft) => void;
  dispose: () => void;
};

type Options = {
  scene: THREE.Scene;
  templateId: TemplateId;
  mobile: boolean;
  element: HTMLElement;
  floor: THREE.Mesh;
  exteriorWalls: THREE.Mesh[];
  architecture: THREE.Group;
  roof: THREE.Mesh;
  ceiling: THREE.Mesh;
  ceilingDetails: THREE.Group;
  currentDraft: () => GalleryDraft;
  onReady: () => void;
  disposeTree: (root: THREE.Object3D) => void;
};

/** Swaps assets in the existing scene; selection, artwork, camera and persistence stay owned by Studio. */
export function attachPremiumEnvironment(options: Options): PremiumEnvironmentHandle {
  const { scene, templateId, element, architecture } = options;
  let disposed = false;
  let loaded = false;
  let asset: THREE.Group | undefined;
  const retained = new THREE.Group();
  const overhead: THREE.Object3D[] = [];
  const materials = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();
  const defaultCeiling = templateId === 'white-cube' ? 'gallery' : templateId === 'nocturne' ? 'dark' : 'skylight';
  const apply = (cutaway: boolean, draft: GalleryDraft) => {
    if (!loaded) return;
    const authoredCeiling = (draft.ceiling ?? 'gallery') === defaultCeiling;
    options.roof.visible = false;
    options.ceiling.visible = options.ceilingDetails.visible = !cutaway && !authoredCeiling;
    overhead.forEach((object) => { object.visible = !cutaway && authoredCeiling; });
  };
  element.dataset.environment = 'premium-loading';
  const path = publicAssetUrl(`assets/templates/premium-v1/${templateId}-${options.mobile ? 'mobile' : 'desktop'}.glb`);
  new GLTFLoader().loadAsync(path).then((gltf) => {
    asset = gltf.scene;
    if (disposed) { options.disposeTree(asset); return; }
    validatePremiumEnvironment(asset, templateId);
    asset.updateMatrixWorld(true);
    const shells = new Map<string, THREE.Mesh>();
    const additions: THREE.Mesh[] = [];
    asset.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const role = object.userData.aura_role;
      if (role === 'shell') shells.set(object.userData.aura_surface_id, object);
      else if (role === 'floor') shells.set('floor', object);
      else if (role === 'architecture' || role === 'ceiling' || role === 'collider') additions.push(object);
    });
    for (const key of ['north', 'south', 'west', 'east', 'floor'])
      if (!shells.has(key)) throw new Error(`Missing authored shell ${key}.`);
    const converted = (mesh: THREE.Mesh) => {
      const source = mesh.material as THREE.MeshStandardMaterial;
      let material = materials.get(source);
      if (!material) { material = physicalMaterial(source); materials.set(source, material); }
      return material;
    };
    // Fully prepare geometry/materials before mutating the active room.
    const prepared = [...shells].map(([key, mesh]) => ({ key,
      geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), material: converted(mesh).clone() }));
    for (const child of [...architecture.children]) {
      if (!child.userData.exitSign) retained.add(child);
    }
    for (const { key, geometry, material } of prepared) {
      const target = key === 'floor' ? options.floor : options.exteriorWalls.find((wall) => wall.userData.wallId === key)!;
      const previous = new THREE.Mesh(target.geometry, target.material);
      retained.add(previous);
      target.geometry = geometry; target.material = material;
      material.userData.surfaceRole = key === 'floor' ? 'floor' : 'wall';
      target.position.set(0, 0, 0); target.rotation.set(0, 0, 0); target.scale.set(1, 1, 1);
      target.castShadow = false;
    }
    for (const mesh of additions) {
      const collider = mesh.userData.aura_role === 'collider';
      const clone = new THREE.Mesh(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), collider ? new THREE.MeshBasicMaterial() : converted(mesh));
      clone.name = mesh.name;
      clone.userData = { ...mesh.userData, noWalkCollision: !collider };
      clone.visible = !collider;
      // The shared key sits below the original ceiling. Small overhead
      // fixtures cannot cast large aliased shadows from this proxy light.
      clone.castShadow = !collider && !mesh.userData.lieuva_overhead; clone.receiveShadow = !collider;
      if (mesh.userData.lieuva_overhead) overhead.push(clone);
      architecture.add(clone);
    }
    // Keep metadata/helpers available for inspection. Collision meshes above are
    // intentionally hidden but still consumed by the shared planar controller.
    asset.visible = false; scene.add(asset);
    asset.traverse((object) => { object.userData.noWalkCollision = true; });
    loaded = true;
    element.dataset.environment = 'premium-v1';
    element.dataset.environmentAsset = path;
    element.dataset.environmentTier = options.mobile ? 'mobile' : 'desktop';
    options.onReady();
  }).catch((error: unknown) => {
    if (asset && !loaded) options.disposeTree(asset);
    if (disposed) return;
    element.dataset.environment = 'procedural-fallback';
    element.dataset.environmentError = error instanceof Error ? error.message : 'Environment unavailable';
  });
  return { apply, dispose: () => {
    disposed = true;
    options.disposeTree(retained);
    // The mounted asset and converted meshes are disposed with GalleryScene.
    materials.forEach((material) => { if (!loaded) material.dispose(); });
  } };
}
