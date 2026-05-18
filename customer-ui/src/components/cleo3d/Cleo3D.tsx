// Cleo3D — full-screen 3D avatar that lipsyncs to whatever audio the
// browser's SpeechSynthesis (or any other audio source) is playing.
//
// Stack:
//   - @react-three/fiber for the React-driven Three.js scene
//   - @react-three/drei (useGLTF) for loading the GLB
//   - @pixiv/three-vrm not needed — we use Ready Player Me .glb files which
//     have the standard Oculus Lipsync viseme blendshapes baked in
//   - wawa-lipsync emits viseme weights every frame from a media element
//
// The avatar URL is configurable via VITE_CLEO_AVATAR_URL. Default is a
// known stable half-body female RPM avatar. Swap by uploading a different
// .glb to Cleo Supabase Storage and pointing the env at it.

import { Component, ReactNode, Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import { Lipsync, VISEMES } from "wawa-lipsync";
import * as THREE from "three";

/** Catches any failure in the GLTF load / R3F tree so the page doesn't go
 * silently black. Reports the error inline so debugging is one glance away. */
class AvatarErrorBoundary extends Component<
  { children: ReactNode; url: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { error: err }; }
  componentDidCatch(err: Error) { console.error("[Cleo3D] avatar load failed:", err); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          color: "#fca5a5",
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.75rem",
          padding: "16px",
          textAlign: "center",
          maxWidth: 480,
          margin: "0 auto"
        }}>
          <div style={{ marginBottom: 8 }}>⚠ couldn't load Cleo avatar</div>
          <div style={{ color: "#fca5a5", opacity: 0.7, fontSize: "0.65rem" }}>
            {this.state.error.message}
          </div>
          <div style={{ marginTop: 12, color: "rgba(255,255,255,0.4)", fontSize: "0.6rem" }}>
            URL: {this.props.url}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const DEFAULT_AVATAR_URL =
  "https://ikqurywpmpzwzxvqjkfl.supabase.co/storage/v1/object/public/cleo-avatars/cleo-avatar-v1.glb";

// Resolution priority:
//   1. VITE_CLEO_AVATAR_URL — env always wins (changes during build are
//      authoritative; prevents stale localStorage from earlier "swap avatar"
//      sessions sticking around forever).
//   2. localStorage (set by AvatarPicker) — only used if env is unset
//   3. DEFAULT_AVATAR_URL fallback
function resolveAvatarUrl(): string {
  const envUrl = import.meta.env.VITE_CLEO_AVATAR_URL;
  if (envUrl) return envUrl;
  try {
    const stored = localStorage.getItem("cleo:avatar-url");
    if (stored) return stored;
  } catch { /* SSR / private mode */ }
  return DEFAULT_AVATAR_URL;
}
const AVATAR_URL = resolveAvatarUrl();
// Log so we can see in DevTools which URL was actually picked.
if (typeof window !== "undefined") {
  console.log("[Cleo3D] loading avatar:", AVATAR_URL);
  // Side-effect: if localStorage has a different URL than env, clear it so
  // the env URL is what will be used on next page-load resolution path.
  // Avatar Picker (intentional override) will re-set it after this runs.
  try {
    const stored = localStorage.getItem("cleo:avatar-url");
    if (stored && stored !== AVATAR_URL) {
      console.log("[Cleo3D] clearing stale localStorage override:", stored);
      localStorage.removeItem("cleo:avatar-url");
    }
  } catch { /* private mode */ }
}

// All Oculus Visemes morph target names that Ready Player Me avatars expose.
// wawa-lipsync.viseme returns one of these strings each frame (or "viseme_sil"
// for silence). We set the corresponding blendshape to ~1 and decay the rest.
const ALL_VISEMES: string[] = Object.values(VISEMES);

interface AvatarProps {
  /** The lipsync engine instance — driven externally by the parent. */
  lipsync: Lipsync | null;
}

function Avatar({ lipsync }: AvatarProps): JSX.Element {
  // useGLTF caches across mounts. Suspense boundary handles the load state.
  const { scene } = useGLTF(AVATAR_URL);

  // Find every SkinnedMesh that has morph targets — RPM avatars typically
  // have two: "Wolf3D_Avatar" and "Wolf3D_Head". Both can hold visemes;
  // we apply to all of them defensively.
  const meshes = useMemo(() => {
    const out: THREE.SkinnedMesh[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && (obj as THREE.SkinnedMesh).morphTargetDictionary) {
        out.push(obj as THREE.SkinnedMesh);
      }
    });
    return out;
  }, [scene]);

  // Idle subtle breathing — small chest scale + slow head sway.
  const headRef = useRef<THREE.Object3D | null>(null);

  // Auto-frame using the avatar's actual bounding box:
  //   1. Compute the visible (mesh) bounding box AFTER updateMatrixWorld
  //   2. Scale the avatar to a fixed target height (1.72m) so cm-unit
  //      exports (Avaturn/AvatarSDK often) and m-unit exports (RPM)
  //      both end up the same physical size on screen
  //   3. Translate so the feet end up at world y=0
  //
  // Camera (in <Cleo3D> below) sits at adult eye-line y=1.65, looking at
  // y=1.62 — that frames the head + collar of a 1.72m avatar perfectly.
  //
  // History: tried Head-bone based offset (Head world Y depends on entire
  // bone chain transform, fragile across exporters) and tried no-offset
  // (only works for RPM half-body at standard 1.6m). The bbox-scale
  // approach is the only one that works for any model (RPM, Avaturn,
  // AvatarSDK, custom) regardless of unit scale or origin convention.
  const { scale, yOffset } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(scene);
    const totalHeight = bbox.max.y - bbox.min.y;
    if (!isFinite(totalHeight) || totalHeight <= 0.01) {
      return { scale: 1, yOffset: 0 };
    }
    const TARGET_HEIGHT = 1.72; // adult ~5'8"
    const scale = TARGET_HEIGHT / totalHeight;
    // After scaling, feet are at scale * bbox.min.y; translate to y=0
    const yOffset = -scale * bbox.min.y;
    if (typeof window !== "undefined") {
      console.log(
        `[Cleo3D] auto-frame: bbox=[${bbox.min.y.toFixed(2)}..${bbox.max.y.toFixed(2)}] ` +
        `height=${totalHeight.toFixed(2)} scale=${scale.toFixed(3)} yOffset=${yOffset.toFixed(2)}`
      );
    }
    return { scale, yOffset };
  }, [scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.name === "Head" || obj.name === "head") headRef.current = obj;
    });
  }, [scene]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // gentle head sway
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.4) * 0.04;
      headRef.current.rotation.x = Math.sin(t * 0.5) * 0.02;
    }

    // Apply current viseme — wawa-lipsync.viseme is a single dominant
    // viseme string per frame (or "viseme_sil" when silent).
    if (lipsync) {
      lipsync.processAudio();
      const active = lipsync.viseme; // e.g. "viseme_aa"
      for (const mesh of meshes) {
        const dict = mesh.morphTargetDictionary;
        const inf = mesh.morphTargetInfluences;
        if (!dict || !inf) continue;
        // Decay all viseme blendshapes
        for (const name of ALL_VISEMES) {
          const idx = dict[name];
          if (idx !== undefined) {
            inf[idx] = THREE.MathUtils.lerp(inf[idx], 0, 0.4);
          }
        }
        // Boost the active one
        if (active && active !== "viseme_sil") {
          const idx = dict[active];
          if (idx !== undefined) {
            inf[idx] = THREE.MathUtils.lerp(inf[idx], 1.0, 0.5);
          }
        }
      }
    } else {
      // Settle to 0 when no lipsync engine is attached
      for (const mesh of meshes) {
        const inf = mesh.morphTargetInfluences;
        if (!inf) continue;
        for (const name of ALL_VISEMES) {
          const idx = mesh.morphTargetDictionary?.[name];
          if (idx !== undefined) {
            inf[idx] = THREE.MathUtils.lerp(inf[idx], 0, 0.2);
          }
        }
      }
    }
  });

  // Auto-fit: scaled to 1.72m and translated so feet sit at y=0.
  // Camera (in <Cleo3D>) at y=1.65 looking at y=1.62 → head + collar in frame.
  return <primitive object={scene} position={[0, yOffset, 0]} scale={scale} />;
}

interface Cleo3DProps {
  lipsync: Lipsync | null;
  className?: string;
}

export function Cleo3D({ lipsync, className }: Cleo3DProps): JSX.Element {
  return (
    <AvatarErrorBoundary url={AVATAR_URL}>
      <Canvas
        className={className}
        // "Head + collar" portrait. Works for any avatar because Avatar()
        // auto-scales the model to 1.72m total height with feet at y=0;
        // then this camera at eye-line y=1.65 looking down to y=1.62 frames
        // the head + top of shoulders, cropping T-pose arms at the edges.
        camera={{ position: [0, 1.65, 0.75], fov: 25 }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 1.62, 0);
          camera.updateProjectionMatrix();
        }}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        style={{ background: "transparent" }}
      >
        {/* Studio 3-point lighting — flattering, professional */}
        <ambientLight intensity={0.4} />
        {/* Key light: warm, slightly above-front, primary face illumination */}
        <directionalLight
          position={[1.5, 2, 2.5]}
          intensity={1.6}
          color="#fff5e6"
          castShadow
        />
        {/* Fill light: cooler, opposite side, softer */}
        <directionalLight
          position={[-2, 0.8, 1.5]}
          intensity={0.55}
          color="#a6b8e0"
        />
        {/* Rim light: behind + above, separates her from the dark background */}
        <directionalLight
          position={[0, 2, -2]}
          intensity={0.9}
          color="#c9b5ff"
        />
        <Suspense fallback={null}>
          <Environment preset="studio" />
          <Avatar lipsync={lipsync} />
        </Suspense>
      </Canvas>
    </AvatarErrorBoundary>
  );
}

// Pre-load the avatar so the first paint isn't blocked.
useGLTF.preload(AVATAR_URL);
