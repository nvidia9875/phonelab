// CG の共通部品: 部屋の映り込み、手持ちカメラの揺れ、フィルムの粒子と周辺減光
import React, { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useCurrentFrame, useDelayRender } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** 室内の映り込み（ビニール袋・スマホのガラス・机のつや） */
export const RoomLight: React.FC<{ intensity?: number }> = ({ intensity = 0.6 }) => {
  const { gl, scene } = useThree();
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    return pm.fromScene(new RoomEnvironment(), 0.04).texture;
  }, [gl]);
  useEffect(() => {
    scene.environment = env;
    scene.environmentIntensity = intensity;
  }, [scene, env, intensity]);
  return null;
};

/** 手持ちのゆれ（なめらかな雑音。秒 t → ずれ） */
export function handheld(t: number, amp = 1): { x: number; y: number; rx: number; rz: number } {
  const n = (a: number, b: number, c: number) => Math.sin(t * a + 1.3) * 0.5 + Math.sin(t * b + 4.1) * 0.3 + Math.sin(t * c + 0.7) * 0.2;
  return {
    x: n(0.9, 2.3, 5.1) * 0.0035 * amp,
    y: n(1.1, 2.9, 6.3) * 0.0028 * amp,
    rx: n(0.7, 1.9, 4.7) * 0.0022 * amp,
    rz: n(0.5, 1.7, 3.9) * 0.0016 * amp,
  };
}

/** カメラを、注視点 target を見たまま手持ちでゆらす */
export const HandheldCamera: React.FC<{ pos: [number, number, number]; target: [number, number, number]; fov: number; amp?: number; t: number }> = ({ pos, target, fov, amp = 1, t }) => {
  const { camera, size } = useThree();
  const h = handheld(t, amp);
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = fov;
  cam.aspect = size.width / size.height;
  cam.near = 0.02;
  cam.far = 30;
  cam.position.set(pos[0] + h.x, pos[1] + h.y, pos[2]);
  cam.lookAt(target[0] + h.x, target[1] + h.y, target[2]);
  cam.rotateX(h.rx);
  cam.rotateZ(h.rz);
  cam.updateProjectionMatrix();
  return null;
};

/** 粒子・周辺減光・色味。CG の上に重ねる */
export const FilmLook: React.FC<{ width: number; height: number; grain?: number }> = ({ width, height, grain = 0.09 }) => {
  const f = useCurrentFrame();
  return (
    <>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, mixBlendMode: "overlay", opacity: grain * 4 }}>
        <filter id={`g${f}`}>
          <feTurbulence type="fractalNoise" baseFrequency={0.9} numOctaves={2} seed={f % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={width} height={height} filter={`url(#g${f})`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 48%, transparent 55%, rgba(20,16,12,0.38) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(255,190,120,0.05)", mixBlendMode: "soft-light" }} />
    </>
  );
};

/** 角の丸い箱（スマホ・消しゴム） */
export function roundedBox(w: number, h: number, d: number, r: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(r * 0.5, d * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -(d - bev * 2) / 2);
  return g;
}

/** 木目のテクスチャ（床・机） */
export function woodTexture(base = "#B88A5A", dark = "#8A6239", seed = 1): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 1024);
  let r = seed * 9301;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  // 板
  for (let p = 0; p < 6; p++) {
    const y0 = (p * 1024) / 6;
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
    g.fillRect(0, y0, 1024, 1024 / 6);
    g.fillStyle = "rgba(40,25,10,0.35)";
    g.fillRect(0, y0, 1024, 2);
  }
  // 木目
  for (let i = 0; i < 420; i++) {
    const y = rnd() * 1024;
    g.strokeStyle = rnd() > 0.5 ? `${dark}${Math.floor(20 + rnd() * 40).toString(16)}` : `rgba(255,230,190,${0.04 + rnd() * 0.05})`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x * 0.006 + i) * 6 + (rnd() - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 壁のざらつき（バンプ用） */
export function noiseTexture(seed = 3, scale = 1): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const img = g.createImageData(512, 512);
  let r = seed * 7919;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 90 * scale;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * テクスチャを読み、3D に描き終わるまで書き出しを待たせる。
 * ThreeCanvas はフレームが変わったときしか描かないので、読み終えたら Advance で描き直す
 */
export function useHeldTexture(src: string | null): { tex: THREE.Texture | null; release: () => void } {
  const [state, setState] = React.useState<{ src: string; tex: THREE.Texture } | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const handle = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    if (!src) return;
    const h = delayRender(`texture ${src}`);
    handle.current = h;
    let dead = false;
    new THREE.TextureLoader()
      .loadAsync(src)
      .then((t) => {
        if (dead) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setState({ src, tex: t });
      })
      .catch((e) => cancelRender(e));
    return () => {
      dead = true;
      if (handle.current === h) {
        continueRender(h);
        handle.current = null;
      }
    };
  }, [src, delayRender, continueRender, cancelRender]);
  const tex = state && state.src === src ? state.tex : null;
  React.useEffect(() => () => tex?.dispose(), [tex]);
  const release = React.useCallback(() => {
    if (handle.current !== null) {
      continueRender(handle.current);
      handle.current = null;
    }
  }, [continueRender]);
  return { tex, release };
}

/** テクスチャがそろったら描いてから、書き出しを進める。background は scene の背景に置く */
export const Advance: React.FC<{ textures: (THREE.Texture | null)[]; release: (() => void)[]; background?: THREE.Texture | null }> = ({ textures, release, background }) => {
  const { advance, scene } = useThree();
  const ready = textures.every(Boolean);
  React.useEffect(() => {
    if (!ready) return;
    if (background) scene.background = background;
    advance(performance.now());
    release.forEach((r) => r());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...textures, background]);
  return null;
};
