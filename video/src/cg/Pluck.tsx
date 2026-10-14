// CG: 教室の机で、箱にかけた輪ゴムを指ではじく手元（実写の代わり）。
// 奥（黒板と窓）は 1 枚だけ書き出してぼかし、手前の箱・輪ゴム・指・スマホを毎コマ描く
import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { CameraMotionBlur } from "@remotion/motion-blur";
import * as THREE from "three";
import { Advance, FilmLook, handheld, HandheldCamera, noiseTexture, RoomLight, roundedBox, useHeldTexture, woodTexture } from "./common";

/** はじく時刻（秒）と強さ（輪ゴムを引き上げる量 m） */
export const PLUCKS: { at: number; pull: number }[] = [
  { at: 1.1, pull: 0.009 },
  { at: 3.2, pull: 0.014 },
  { at: 5.3, pull: 0.006 },
  { at: 7.2, pull: 0.016 },
];
const BAND_HZ = 96;
const BOX = { l: 0.24, w: 0.13, h: 0.075 };
const BAND_Z = 0.018;
const CAM = { pos: [0.07, 0.25, 0.44] as [number, number, number], target: [0.04, 0.055, 0] as [number, number, number], fov: 30 };

function setupGl({ gl }: { gl: THREE.WebGLRenderer }) {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.0;
  gl.outputColorSpace = THREE.SRGBColorSpace;
}

/** いまの「はじき」: 引いている途中（指で持ち上げ中）か、放したあとの振動 */
function pluckState(t: number): { pull: number; vib: number; since: number; fingerX: number; p: (typeof PLUCKS)[number] | null; phase: "idle" | "approach" | "pull" | "release" } {
  let cur: (typeof PLUCKS)[number] | null = null;
  for (const p of PLUCKS) if (t >= p.at - 0.6) cur = p;
  if (!cur) return { pull: 0, vib: 0, since: 99, fingerX: 0.03, p: null, phase: "idle" };
  const s = t - cur.at;
  const fingerX = 0.028;
  if (s < -0.25) return { pull: 0, vib: decay(t, cur), since: s, fingerX, p: cur, phase: "approach" };
  if (s < 0) {
    const k = (s + 0.25) / 0.25;
    return { pull: cur.pull * Math.sin((k * Math.PI) / 2), vib: decay(t, cur), since: s, fingerX, p: cur, phase: "pull" };
  }
  return { pull: 0, vib: cur.pull * Math.exp(-s * 5.5), since: s, fingerX, p: cur, phase: "release" };
}

/** 前のはじきの残りの振動 */
function decay(t: number, cur: (typeof PLUCKS)[number]): number {
  const i = PLUCKS.indexOf(cur);
  if (i <= 0) return 0;
  const prev = PLUCKS[i - 1];
  return prev.pull * Math.exp(-(t - prev.at) * 5.5);
}

/** 輪ゴムの上の辺。引いているときは指の位置を頂点にした山、放したあとは弦の振動（シャッターの間に何本か重ねてぶれを出す） */
const Band: React.FC<{ t: number; z: number; active: boolean; color: string }> = ({ t, z, active, color }) => {
  const st = active ? pluckState(t) : { pull: 0, vib: 0, since: 99, fingerX: 0, p: null, phase: "idle" as const };
  const half = BOX.l / 2 + 0.004;
  const top = BOX.h + 0.0015;
  const subs = st.vib > 0.0004 ? 7 : 1;
  const curves: THREE.TubeGeometry[] = [];
  for (let k = 0; k < subs; k++) {
    const tt = t + (k / subs) * (1 / 60);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const x = -half + u * half * 2;
      let y = top;
      if (st.pull > 0) {
        const a = (st.fingerX + half) / (half * 2);
        y += st.pull * (u < a ? u / a : (1 - u) / (1 - a));
      }
      if (st.vib > 0) y += st.vib * Math.sin(Math.PI * u) * Math.cos(2 * Math.PI * BAND_HZ * (tt - (st.p?.at ?? 0)));
      pts.push(new THREE.Vector3(x, y, z));
    }
    curves.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0013, 6, false));
  }
  return (
    <group>
      {curves.map((g, i) => (
        <mesh key={i} geometry={g} scale={[1, 1, 1]}>
          <meshPhysicalMaterial color={color} roughness={0.45} clearcoat={0.3} transparent={subs > 1} opacity={subs > 1 ? 0.32 : 1} depthWrite={subs === 1} />
        </mesh>
      ))}
      {/* 箱の両端で下へ回り込む部分 */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (half - 0.0005), top / 2, z]}>
          <boxGeometry args={[0.0022, top, 0.0026]} />
          <meshPhysicalMaterial color={color} roughness={0.45} />
        </mesh>
      ))}
    </group>
  );
};

/** はじく指（画面の上から入って、輪ゴムを引き上げて放す） */
const SKIN = { color: "#D99A78", roughness: 0.48, sheen: 0.7, sheenColor: new THREE.Color("#FFB894"), sheenRoughness: 0.45, clearcoat: 0.1, clearcoatRoughness: 0.5 };

/** 指の一節: 先が丸く、少し平たい（x 方向に len） */
function phalanx(len: number, r0: number, r1: number, tip: boolean): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let r = r0 + (r1 - r0) * u;
    let y = u * len;
    if (tip && u > 0.7) {
      const k = (u - 0.7) / 0.3;
      r = r1 * Math.sqrt(Math.max(0, 1 - k * k));
      y = 0.7 * len + k * r1 * 1.1;
    }
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateZ(-Math.PI / 2); // y → x
  g.scale(1, 0.86, 1);
  return g;
}

const FingerTip: React.FC<{ t: number }> = ({ t }) => {
  const st = pluckState(t);
  const g = useMemo(() => ({ dist: phalanx(0.026, 0.0088, 0.0082, true), mid: phalanx(0.032, 0.0088, 0.0096, false), prox: phalanx(0.11, 0.0096, 0.0125, false) }), []);
  if (!st.p) return null;
  const s = st.since;
  const top = BOX.h + 0.0015;
  let y: number;
  let x = st.fingerX;
  let z = BAND_Z + 0.002;
  if (s < -0.25) {
    const k = Math.min(1, (s + 0.6) / 0.35);
    const e = 1 - (1 - k) ** 3;
    y = top + 0.08 * (1 - e) - 0.003 * e;
    x += 0.04 * (1 - e);
  } else if (s < 0) {
    y = top - 0.003 + st.pull;
  } else {
    const k = Math.min(1, s / 0.35);
    y = top + st.p.pull + 0.1 * k * k + 0.008 * k;
    x += 0.04 * k;
    z += 0.02 * k;
  }
  if (s > 0.4) return null;
  // 指先の腹を上に向けて輪ゴムの下に入れ、引き上げる。手は右上奥（画面の外）
  const DL = 0.0272;
  return (
    <group position={[x, y, z]} rotation={[0, 0.5, 0.95]}>
      <mesh geometry={g.dist} position={[DL, 0, 0]} rotation={[0, Math.PI, 0]}>
        <meshPhysicalMaterial {...SKIN} />
      </mesh>
      <group position={[DL - 0.002, 0, 0]} rotation={[0, 0, -0.32]}>
        <mesh geometry={g.mid}>
          <meshPhysicalMaterial {...SKIN} />
        </mesh>
        <group position={[0.029, 0, 0]} rotation={[0, 0, -0.28]}>
          <mesh geometry={g.prox}>
            <meshPhysicalMaterial {...SKIN} />
          </mesh>
          {/* 手の甲（画面の外へ） */}
          <mesh position={[0.15, -0.012, -0.02]} scale={[1.6, 0.6, 1.2]}>
            <sphereGeometry args={[0.04, 24, 16]} />
            <meshPhysicalMaterial {...SKIN} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

/** 段ボールの箱（ふたなし） */
const Box: React.FC = () => {
  const card = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = "#C79B68";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? "90,60,30" : "240,210,170"},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    // 段ボールの縦の筋
    for (let x = 0; x < 512; x += 9) {
      g.fillStyle = "rgba(80,50,20,0.05)";
      g.fillRect(x, 0, 3, 512);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const th = 0.003;
  const m = <meshStandardMaterial map={card} roughness={0.92} />;
  return (
    <group>
      <mesh position={[0, th / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOX.l, th, BOX.w]} />
        {m}
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={`l${k}`} position={[0, BOX.h / 2, (k * (BOX.w - th)) / 2]} castShadow receiveShadow>
          <boxGeometry args={[BOX.l, BOX.h, th]} />
          {m}
        </mesh>
      ))}
      {[-1, 1].map((k) => (
        <mesh key={`s${k}`} position={[(k * (BOX.l - th)) / 2, BOX.h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[th, BOX.h, BOX.w]} />
          {m}
        </mesh>
      ))}
      {/* 箱の中の影 */}
      <mesh position={[0, th + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOX.l - 0.01, BOX.w - 0.01]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
    </group>
  );
};

/** 机に置いたスマホ（音の測定の画面） */
const PhoneOnDesk: React.FC<{ screen: THREE.Texture | null }> = ({ screen }) => {
  const body = useMemo(() => roundedBox(0.0715, 0.147, 0.0078, 0.009), []);
  return (
    <group position={[0.2, 0.0039, 0.03]} rotation={[-Math.PI / 2, 0, 0.35]}>
      <mesh geometry={body} castShadow receiveShadow>
        <meshPhysicalMaterial color="#1E2228" roughness={0.35} metalness={0.5} clearcoat={1} />
      </mesh>
      <mesh position={[0, 0, 0.0041]}>
        <planeGeometry args={[0.066, 0.141]} />
        {screen ? <meshBasicMaterial key="v" map={screen} toneMapped={false} /> : <meshBasicMaterial key="c" color="#F7F3EA" />}
      </mesh>
      <mesh position={[0, 0, 0.0043]}>
        <planeGeometry args={[0.068, 0.143]} />
        <meshPhysicalMaterial color="#ffffff" transparent opacity={0.06} roughness={0.05} clearcoat={1} />
      </mesh>
    </group>
  );
};

const Desk: React.FC = () => {
  const wood = useMemo(() => {
    const t = woodTexture("#D2AE7E", "#9A7448", 7);
    t.repeat.set(1.5, 1.5);
    return t;
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1.4, 0.9]} />
      <meshStandardMaterial map={wood} roughness={0.45} />
    </mesh>
  );
};

const Lights: React.FC = () => (
  <>
    <hemisphereLight args={["#FFF6E8", "#8A6A48", 0.6]} />
    <directionalLight position={[-0.6, 0.9, 0.4]} intensity={2.6} color="#FFEEDD" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-0.4} shadow-camera-right={0.4} shadow-camera-top={0.4} shadow-camera-bottom={-0.4} shadow-radius={5} shadow-bias={-0.0003} />
    <pointLight position={[0.4, 0.4, 0.5]} intensity={0.35} color="#D8E6FF" />
  </>
);

/** 奥: 黒板・窓・ほかの机（1 枚だけ書き出してぼかす） */
export const PluckRoom: React.FC = () => {
  const { width, height } = useVideoConfig();
  const wall = useMemo(() => noiseTexture(9, 0.5), []);
  return (
    <AbsoluteFill style={{ background: "#E8E2D6" }}>
      <AbsoluteFill style={{ filter: "blur(14px)", transform: "scale(1.04)" }}>
        <ThreeCanvas width={width} height={height} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={setupGl} style={{ position: "absolute", inset: 0 }}>
          <HandheldCamera {...CAM} t={0} amp={0} />
          <RoomLight intensity={0.5} />
          <hemisphereLight args={["#FFF6E8", "#8A6A48", 0.8]} />
          <color attach="background" args={["#E8E2D6"]} />
          {/* 奥の壁と黒板 */}
          <mesh position={[0, 1.2, -3.2]}>
            <planeGeometry args={[8, 4]} />
            <meshStandardMaterial color="#EDE8DD" roughness={0.95} bumpMap={wall} bumpScale={0.4} />
          </mesh>
          <mesh position={[-0.2, 1.25, -3.18]}>
            <planeGeometry args={[2.6, 1.1]} />
            <meshStandardMaterial color="#2F4A3C" roughness={0.9} />
          </mesh>
          <mesh position={[-0.2, 0.68, -3.15]}>
            <boxGeometry args={[2.6, 0.04, 0.06]} />
            <meshStandardMaterial color="#8C7A62" roughness={0.8} />
          </mesh>
          {/* 左の窓の光 */}
          <mesh position={[-2.6, 1.2, -2.0]} rotation={[0, 0.9, 0]}>
            <planeGeometry args={[2.2, 1.6]} />
            <meshBasicMaterial color="#FFFBF2" toneMapped={false} />
          </mesh>
          {/* 奥の机と椅子 */}
          {[-0.9, 0.2, 1.3].map((x) => (
            <group key={x} position={[x, 0, -1.6]}>
              <mesh position={[0, -0.02, 0]}>
                <boxGeometry args={[0.65, 0.025, 0.45]} />
                <meshStandardMaterial color="#C9A57A" roughness={0.6} />
              </mesh>
              <mesh position={[0, -0.25, 0.3]}>
                <boxGeometry args={[0.4, 0.4, 0.04]} />
                <meshStandardMaterial color="#6E7F8C" roughness={0.7} />
              </mesh>
            </group>
          ))}
        </ThreeCanvas>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Front: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = f / fps;
  const bg = useHeldTexture(staticFile("cg/pluck-room.png"));
  const screen = useHeldTexture(staticFile("04-checks.png"));
  return (
    <ThreeCanvas width={width} height={height} shadows={{ type: THREE.PCFSoftShadowMap }} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={setupGl} style={{ position: "absolute", inset: 0 }}>
      <HandheldCamera {...CAM} t={0} amp={0} />
      <RoomLight intensity={0.6} />
      <Lights />
      <Desk />
      <group position={[-0.03, 0, 0]}>
        <Box />
        <Band t={t} z={BAND_Z} active color="#C88A45" />
        <Band t={t} z={-0.03} active={false} color="#B85F3C" />
        <FingerTip t={t} />
      </group>
      <PhoneOnDesk screen={screen.tex} />
      <Advance textures={[bg.tex, screen.tex]} release={[bg.release, screen.release]} background={bg.tex} />
    </ThreeCanvas>
  );
};

export const PluckCG: React.FC = () => {
  const { width, height } = useVideoConfig();
  const t = useCurrentFrame() / 30;
  const h = handheld(t, 1.6);
  return (
    <AbsoluteFill style={{ background: "#E8E2D6", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(1.05) translate(${h.x * 1500}px, ${h.y * 1500}px) rotate(${h.rz * 40}deg)` }}>
        <CameraMotionBlur samples={6} shutterAngle={180}>
          <Front />
        </CameraMotionBlur>
      </AbsoluteFill>
      <FilmLook width={width} height={height} />
    </AbsoluteFill>
  );
};
