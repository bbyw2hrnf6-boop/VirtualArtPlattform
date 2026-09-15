import * as THREE from 'three';
import { clampWalkFov, createWalkPreferences } from './walkPreferences';
import { VISITOR_KEYBOARD_CODES, visitorLookDirection } from '../visitorKeyboard';
import type { SceneBounds as Bounds } from './runtimeQuality';

type WalkCollision = (
  next: THREE.Vector3,
  previous: THREE.Vector3,
) => boolean | void;

export function createFirstPersonWalk(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  bounds: () => Bounds,
  collision?: WalkCollision,
  findPath?: (from: THREE.Vector3, to: THREE.Vector3) => THREE.Vector3[] | null,
  onUserIntent?: () => void,
  onEscape?: () => void,
  allowWheelZoom = true,
  defaultPace = 1,
) {
  const keys = new Set<string>();
  let enabled = true;
  let destinations: THREE.Vector3[] = [];
  let blockedFrames = 0;
  const keyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (VISITOR_KEYBOARD_CODES.has(event.code)) {
      if (!enabled) {
        onUserIntent?.();
        return;
      }
      // Looking remains independent of a floor route. Only manual translation
      // replaces that route, so visitors can inspect art while walking to it.
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) destinations = [];
      keys.add(event.code);
      onUserIntent?.();
      event.preventDefault();
    }
  };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const blur = () => keys.clear();
  canvas.addEventListener("keydown", keyDown);
  canvas.addEventListener("keyup", keyUp);
  canvas.addEventListener("blur", blur);
  camera.rotation.order = "YXZ";
  let dragging = false;
  let dragged = false;
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  let yaw = camera.rotation.y;
  let pitch = camera.rotation.x;
  let eyeHeight = camera.position.y;
  let targetFov = camera.fov;
  const preferences = allowWheelZoom ? createWalkPreferences(canvas, defaultPace, () => {
    onUserIntent?.();
    targetFov = preferences!.fov();
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }) : undefined;
  const changeFov = (value: number) => {
    targetFov = preferences ? clampWalkFov(value) : THREE.MathUtils.clamp(value, 40, 72);
    preferences?.setFov(targetFov);
  };
  let touchForward = 0;
  let touchStrafe = 0;
  let lastPinchDistance = 0;
  const touches = new Map<number, { x: number; y: number }>();
  const syncRotation = () => {
    const rotation = new THREE.Euler().setFromQuaternion(
      camera.quaternion,
      "YXZ",
    );
    pitch = rotation.x;
    yaw = rotation.y;
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  };
  const lookAt = (target: THREE.Vector3) => {
    eyeHeight = camera.position.y;
    camera.lookAt(target);
    syncRotation();
  };
  const pinchDistance = () => {
    const points = [...touches.values()];
    return points.length < 2
      ? 0
      : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    onUserIntent?.();
    if (!enabled) return;
    canvas.focus({ preventScroll: true });
    if (event.pointerType === "touch") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        dragging = false;
        pointerId = -1;
        dragged = true;
        lastPinchDistance = pinchDistance();
        return;
      }
    }
    dragging = true;
    dragged = false;
    pointerId = event.pointerId;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-looking");
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch" && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        const distance = pinchDistance();
        if (lastPinchDistance)
          changeFov(
            targetFov + (lastPinchDistance - distance) * 0.075,
          );
        lastPinchDistance = distance;
        dragged = true;
        event.preventDefault();
        return;
      }
    }
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (!dragged && Math.hypot(event.clientX - startX, event.clientY - startY) < (event.pointerType === "touch" ? 8 : 4)) return;
    dragged = true;
    const lookSensitivity = event.pointerType === "touch" ? 0.00245 : 0.0028;
    yaw -= dx * lookSensitivity;
    pitch -= dy * lookSensitivity;
    pitch = THREE.MathUtils.clamp(pitch, -1.22, 1.22);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const pointerUp = (event: PointerEvent) => {
    if (event.type === "pointercancel") dragged = true;
    if (event.pointerType === "touch") {
      touches.delete(event.pointerId);
      lastPinchDistance = touches.size >= 2 ? pinchDistance() : 0;
    }
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
    canvas.classList.remove("is-looking");
  };
  const wheel = (event: WheelEvent) => {
    if (!enabled || !allowWheelZoom) return;
    onUserIntent?.();
    changeFov(targetFov + event.deltaY * 0.012);
    event.preventDefault();
  };
  const contextMenu = (event: Event) => event.preventDefault();
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", contextMenu);
  let previousTime = performance.now();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const update = () => {
    const now = performance.now();
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      targetFov,
      1 - Math.exp(-11 * delta),
    );
    camera.updateProjectionMatrix();
    if (!enabled) return;
    const turnDirection =
      (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
    if (turnDirection) {
      yaw += turnDirection * 1.72 * delta;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
    const lookDirection = visitorLookDirection(keys);
    if (lookDirection) {
      pitch = THREE.MathUtils.clamp(pitch + lookDirection * 1.15 * delta, -1.22, 1.22);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    desired.set(0, 0, 0);
    if (keys.has("KeyW")) desired.add(forward);
    if (keys.has("KeyS")) desired.sub(forward);
    if (keys.has("KeyD")) desired.add(right);
    if (keys.has("KeyA")) desired.sub(right);
    if (touchForward) desired.addScaledVector(forward, touchForward);
    if (touchStrafe) desired.addScaledVector(right, touchStrafe);
    const pace = preferences?.pace() ?? 1;
    if (desired.lengthSq()) desired.normalize().multiplyScalar(2.3 * pace);
    else if (destinations.length) {
      desired.subVectors(destinations[0], camera.position);
      desired.y = 0;
      const distance = desired.length();
      if (distance < 0.14) {
        destinations.shift();
        desired.set(0, 0, 0);
      } else
        desired
          .normalize()
          .multiplyScalar(Math.min(2.2 * pace, Math.max(0.55, distance * 1.35)));
    }
    const response = desired.lengthSq() > velocity.lengthSq() ? 7.4 : 10.8;
    velocity.lerp(desired, 1 - Math.exp(-response * delta));
    previous.copy(camera.position);
    camera.position.addScaledVector(velocity, delta);
    const current = bounds();
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      current.minX,
      current.maxX,
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      current.minZ,
      current.maxZ,
    );
    camera.position.y = eyeHeight;
    const moved = collision?.(camera.position, previous);
    if (moved === false && camera.position.distanceToSquared(previous) < 1e-7)
      velocity.multiplyScalar(0.18);
    if (
      destinations.length &&
      moved === false &&
      camera.position.distanceToSquared(previous) < 1e-7
    ) {
      blockedFrames += 1;
      if (blockedFrames > 8) {
        destinations = [];
        velocity.set(0, 0, 0);
      }
    } else blockedFrames = 0;
  };
  const moveTo = (point: THREE.Vector3) => {
    const current = bounds();
    const candidate = point.clone();
    candidate.x = THREE.MathUtils.clamp(
      candidate.x,
      current.minX,
      current.maxX,
    );
    candidate.z = THREE.MathUtils.clamp(
      candidate.z,
      current.minZ,
      current.maxZ,
    );
    candidate.y = eyeHeight;
    const path = findPath ? findPath(camera.position, candidate) : [candidate];
    if (!path?.length) return false;
    destinations = path;
    blockedFrames = 0;
    return true;
  };
  const setEnabled = (value: boolean) => {
    enabled = value;
    preferences?.show(value);
    keys.clear();
    touches.clear();
    lastPinchDistance = 0;
    dragging = false;
    pointerId = -1;
    canvas.classList.remove("is-looking");
    touchForward = 0;
    touchStrafe = 0;
    velocity.set(0, 0, 0);
    if (!value) destinations = [];
  };
  const setTouchMovement = (direction?: "forward" | "backward" | "left" | "right") => {
    touchForward = direction === "forward" ? 1 : direction === "backward" ? -1 : 0;
    touchStrafe = direction === "right" ? 1 : direction === "left" ? -1 : 0;
    if (!direction || !enabled) return;
    destinations = [];
    onUserIntent?.();
  };
  const consumeClick = () => {
    const isClick = !dragged && enabled;
    // Consume once per gesture, including the second finger of a pinch and
    // browser-generated compatibility clicks after touch pointerup.
    dragged = true;
    return isClick;
  };
  const syncFromCamera = () => {
    targetFov = camera.fov;
    lookAt(
      camera.position
        .clone()
        .add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)),
    );
  };
  return {
    preferredFov: () => preferences?.fov() ?? 62,
    zoom: (direction: -1 | 1) => { if (enabled) { changeFov(targetFov - direction * 8); onUserIntent?.(); } },
    update,
    lookAt,
    moveTo,
    setEnabled,
    setTouchMovement,
    syncFromCamera,
    consumeClick,
    destination: () => destinations.at(-1)?.clone(),
    hasDestination: () => destinations.length > 0,
    // Demand-rendered visitors need the same easing as the continuously drawn
    // Studio scene, including the final braking and FOV interpolation frames.
    needsUpdate: () => Math.abs(camera.fov - targetFov) > .001 || (enabled && (
      keys.size > 0 || touchForward !== 0 || touchStrafe !== 0 ||
      destinations.length > 0 || velocity.lengthSq() > .000001
    )),
    dispose: () => {
      preferences?.dispose();
      canvas.removeEventListener("keydown", keyDown);
      canvas.removeEventListener("keyup", keyUp);
      canvas.removeEventListener("blur", blur);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
    },
  };
}
