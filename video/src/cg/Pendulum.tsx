// CG: 家で、袋に入れたスマホの振り子を横から撮った絵（実写の代わり）。
// 揺れは画面録画のセンサー（docs の MOTION と同じ式: 糸 0.8 m、15 cm 持ち上げて放す、減衰 0.03/s）。
// スマホの画面には、同じ測定の本物の画面録画を貼る
import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { CameraMotionBlur } from "@remotion/motion-blur";
import * as THREE from "three";
import { Advance, FilmLook, handheld, HandheldCamera, noiseTexture, RoomLight, roundedBox, useHeldTexture, woodTexture } from "./common";

/** 放す時刻（秒）。画面録画 pendulum-screen-measure.mp4 の「そっと放して」と同じ */
export const RELEASE = 5.07;
const G = 9.81;
const L = 0.8;
const H = 0.15;
const TH0 = Math.acos(1 - H / L);
const WN = Math.sqrt(G / L);
const PIVOT: [number, number, number] = [0, 1.25, 0];
/** 吊り具（クリップ）から袋の中心まで */
const CLIP_TO_CENTER = 0.12;

/** 糸の角度（左に持ち上げた状態が負） */
function angle(t: number): number {
  const s = t - RELEASE;
  if (s < 0) return -TH0 + Math.sin(t * 7.3) * 0.004 + Math.sin(t * 3.1) * 0.003; // 手で持っている小さなゆれ
  return -TH0 * Math.cos(WN * s) * Math.exp(-0.03 * s);
}

const CAM = { pos: [0.13, 0.62, 1.62] as [number, number, number], target: [0.13, 0.6, 0] as [number, number, number], fov: 23 };

const Lights: React.FC<{ shadows?: boolean }> = ({ shadows }) => (
  <>
    <hemisphereLight args={["#FFF1DE", "#7A5A3A", 0.55]} />
    {/* 左の窓からの光 */}
    <directionalLight
      position={[-2.2, 2.4, 1.4]}
      intensity={2.4}
      color="#FFE9CC"
      castShadow={shadows}
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-1.5}
      shadow-camera-right={1.5}
      shadow-camera-top={1.5}
      shadow-camera-bottom={-1.5}
      shadow-radius={6}
      shadow-bias={-0.0004}
    />
    <pointLight position={[1.2, 1.1, 1.6]} intensity={0.6} color="#CFE0FF" />
  </>
);

/* ---------- 奥（ぼかす層）: 壁・本棚・椅子の背 ---------- */
const Room: React.FC<{ t: number }> = ({ t }) => {
  const wall = useMemo(() => noiseTexture(5, 0.6), []);
  const wood = useMemo(() => woodTexture("#9C7046", "#6B4423", 2), []);
  const books = useMemo(() => {
    const cols = ["#C9573F", "#E9D8B4", "#3E5C76", "#D8A23A", "#6E8B5C", "#F2EEE4", "#2F3B4C", "#B7472A", "#8D6E97", "#E4C590", "#4F7A8A", "#D9D2C3"];
    let x = 0;
    return cols.concat(cols.slice(0, 6)).map((c, i) => {
      const w = 0.022 + ((i * 37) % 9) * 0.004;
      const h = 0.2 + ((i * 53) % 7) * 0.018;
      const b = { c, x: x + w / 2, w, h, tilt: i === 9 ? 0.12 : 0 };
      x += w + 0.002;
      return b;
    });
  }, []);
  return (
    <group>
      {/* 壁 */}
      <mesh position={[0, 1.2, -1.05]} receiveShadow>
        <planeGeometry args={[6, 3]} />
        <meshStandardMaterial color="#EDE6DA" roughness={0.95} bumpMap={wall} bumpScale={0.6} />
      </mesh>
      {/* 床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 4]} />
        <meshStandardMaterial map={wood} roughness={0.6} />
      </mesh>
      {/* 本棚（右奥） */}
      <group position={[0.66, 0.0, -0.82]}>
        {[0.3, 0.62, 0.94].map((y) => (
          <mesh key={y} position={[0.4, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.02, 0.28]} />
            <meshStandardMaterial map={wood} roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[-0.05, 0.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.02, 1.2, 0.28]} />
          <meshStandardMaterial map={wood} roughness={0.7} />
        </mesh>
        {[0.31, 0.63].map((y, row) =>
          books.slice(row * 9, row * 9 + 9).map((b, i) => (
            <mesh key={`${row}-${i}`} position={[b.x - (row ? books[9].x - books[0].x : 0) + 0.0, y + 0.01 + b.h / 2, -0.02]} rotation={[0, 0, b.tilt]} castShadow>
              <boxGeometry args={[b.w, b.h, 0.17]} />
              <meshStandardMaterial color={b.c} roughness={0.8} />
            </mesh>
          )),
        )}
        {/* 小さな観葉植物 */}
        <mesh position={[0.62, 0.95 + 0.06, 0]}>
          <cylinderGeometry args={[0.05, 0.04, 0.1, 24]} />
          <meshStandardMaterial color="#D8CFC0" roughness={0.6} />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[0.62 + Math.sin(i * 2.1) * 0.05, 1.08 + (i % 3) * 0.03, Math.cos(i * 2.1) * 0.04]} rotation={[Math.sin(i) * 0.8, i, Math.cos(i * 1.7) * 0.9 + Math.sin(t * 0.6 + i) * 0.02]}>
            <sphereGeometry args={[0.045, 12, 8]} />
            <meshStandardMaterial color={i % 2 ? "#4F7A3A" : "#5E8C44"} roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* 左の窓（明るい）とレースのカーテン */}
      <mesh position={[-1.05, 1.15, -1.04]}>
        <planeGeometry args={[0.9, 1.3]} />
        <meshBasicMaterial color="#FFF8EC" toneMapped={false} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[-1.42 + i * 0.055, 1.15, -0.98 + (i % 2) * 0.03]} rotation={[0, (i % 2 ? 0.5 : -0.5), 0]}>
          <planeGeometry args={[0.07, 1.4]} />
          <meshStandardMaterial color="#FFFFFF" transparent opacity={0.55} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[-0.58, 1.15, -1.03]}>
        <boxGeometry args={[0.05, 1.4, 0.04]} />
        <meshStandardMaterial color="#F4F1EA" roughness={0.6} />
      </mesh>
      {/* 壁のスイッチ */}
      <mesh position={[-0.52, 1.05, -1.04]}>
        <boxGeometry args={[0.07, 0.12, 0.01]} />
        <meshStandardMaterial color="#F7F5EF" roughness={0.4} />
      </mesh>
      {/* 下のクッション */}
      <mesh position={[0, 0.07, 0.05]} castShadow receiveShadow scale={[1, 0.35, 0.8]}>
        <sphereGeometry args={[0.3, 32, 16]} />
        <meshStandardMaterial color="#8FA7B5" roughness={0.95} />
      </mesh>
    </group>
  );
};


/* ---------- 手前: 糸と袋 ---------- */
const Bag: React.FC<{ t: number; screen: THREE.Texture | null }> = ({ t, screen }) => {
  const th = angle(t);
  const yaw = Math.sin(t * 1.35 + 0.4) * 0.035 * Math.min(1, Math.max(0.3, t - RELEASE + 0.3));
  const strLen = L - CLIP_TO_CENTER;
  const phone = useMemo(() => roundedBox(0.0715, 0.147, 0.0078, 0.009), []);
  const eraser = useMemo(() => roundedBox(0.024, 0.064, 0.012, 0.002), []);
  const bagGeo = useMemo(() => {
    const g = roundedBox(0.17, 0.2, 0.016, 0.006);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // ふくらみ（中央が厚い）と、しわ
      const bulge = (1 - (x / 0.085) ** 2) * (1 - ((y + 0.02) / 0.12) ** 2);
      p.setZ(i, z * (0.5 + 0.9 * Math.max(0, bulge)) + Math.sin(x * 80 + y * 35) * 0.0009 + Math.sin(y * 140 + x * 20) * 0.0006);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group position={PIVOT} rotation={[0, 0, th]}>
      {/* 糸 */}
      <mesh position={[0, -strLen / 2 - 0.004, 0]}>
        <cylinderGeometry args={[0.0007, 0.0007, strLen - 0.008, 6]} />
        <meshStandardMaterial color="#F1ECE0" roughness={0.9} />
      </mesh>
      <group position={[0, -L, 0]} rotation={[0, yaw, 0]}>
        {/* 目玉クリップ: 黒い本体と、糸を結んだ 2 本の針金 */}
        <mesh position={[0, CLIP_TO_CENTER - 0.022, 0]}>
          <boxGeometry args={[0.034, 0.02, 0.012]} />
          <meshPhysicalMaterial color="#141416" roughness={0.3} metalness={0.2} clearcoat={0.8} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[k * 0.007, CLIP_TO_CENTER - 0.004, 0]} rotation={[0, 0, k * 0.55]}>
            <cylinderGeometry args={[0.0009, 0.0009, 0.022, 8]} />
            <meshStandardMaterial color="#D6DADF" metalness={1} roughness={0.2} />
          </mesh>
        ))}
        {/* スマホ（画面はこちら向き） */}
        <group position={[-0.028, -0.022, 0.0]}>
          <mesh geometry={phone}>
            <meshPhysicalMaterial color="#1E2228" roughness={0.35} metalness={0.5} clearcoat={1} clearcoatRoughness={0.1} />
          </mesh>
          <mesh position={[0, 0, 0.0041]}>
            <planeGeometry args={[0.066, 0.141]} />
            {screen ? <meshBasicMaterial key="v" map={screen} toneMapped={false} /> : <meshBasicMaterial key="c" color="#F7F3EA" toneMapped={false} />}
          </mesh>
        </group>
        {/* 消しゴム（紙のスリーブ付き） */}
        <group position={[0.05, -0.064, -0.001]} rotation={[0, 0, 0.1]}>
          <mesh geometry={eraser}>
            <meshStandardMaterial color="#F3F1EA" roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.006, 0]}>
            <boxGeometry args={[0.0255, 0.038, 0.0135]} />
            <meshStandardMaterial color="#2F5FAE" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.006, 0]}>
            <boxGeometry args={[0.0257, 0.006, 0.0137]} />
            <meshStandardMaterial color="#F2F2F2" roughness={0.7} />
          </mesh>
        </group>
        {/* 袋（透明のジッパー袋） */}
        <mesh geometry={bagGeo} position={[0, -0.012, 0]}>
          <meshPhysicalMaterial color="#FFFFFF" transmission={1} thickness={0.004} roughness={0.12} ior={1.42} clearcoat={1} clearcoatRoughness={0.12} specularIntensity={1} envMapIntensity={1.6} />
        </mesh>
        {/* ジッパー */}
        <mesh position={[0, 0.081, 0.0]}>
          <boxGeometry args={[0.168, 0.007, 0.014]} />
          <meshPhysicalMaterial color="#CFE0F0" transmission={0.7} thickness={0.004} roughness={0.25} clearcoat={1} />
        </mesh>
      </group>
    </group>
  );
};

function setupGl({ gl }: { gl: THREE.WebGLRenderer }) {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.05;
  gl.outputColorSpace = THREE.SRGBColorSpace;
}

/** 奥の部屋（1 枚だけ書き出して、ぼかして背景に使う） */
export const PendulumRoom: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#E9E1D3" }}>
      <AbsoluteFill style={{ filter: "blur(9px)", transform: "scale(1.03)" }}>
        <ThreeCanvas width={width} height={height} shadows={{ type: THREE.PCFSoftShadowMap }} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={setupGl} style={{ position: "absolute", inset: 0 }}>
          <HandheldCamera {...CAM} t={0} amp={0} />
          <RoomLight intensity={0.35} />
          <Lights shadows />
          <color attach="background" args={["#E9E1D3"]} />
          <Room t={0} />
        </ThreeCanvas>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Front: React.FC = () => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = f / fps;
  const bg = useHeldTexture(staticFile("cg/pendulum-room.png"));
  // スマホの画面: 画面録画を 1 枚ずつ（public/cg/pendulum-screen/0001.jpg〜）
  const n = Math.min(480, Math.max(1, Math.floor(t * 30) + 1));
  const screen = useHeldTexture(staticFile(`cg/pendulum-screen/${String(n).padStart(4, "0")}.jpg`));
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={setupGl} style={{ position: "absolute", inset: 0 }}>
      <HandheldCamera {...CAM} t={0} amp={0} />
      <RoomLight intensity={0.9} />
      <Lights />
      <Bag t={t} screen={screen.tex} />
      <Advance textures={[bg.tex, screen.tex]} release={[bg.release, screen.release]} background={bg.tex} />
    </ThreeCanvas>
  );
};

export const PendulumCG: React.FC = () => {
  const { width, height } = useVideoConfig();
  const t = useCurrentFrame() / 30;
  const h = handheld(t, 1.4);
  return (
    <AbsoluteFill style={{ background: "#E9E1D3", overflow: "hidden" }}>
      {/* 手持ちのゆれは、絵全体を少し動かして出す（背景と袋が一緒に動く） */}
      <AbsoluteFill style={{ transform: `scale(1.04) translate(${h.x * 1500}px, ${h.y * 1500}px) rotate(${h.rz * 40}deg)` }}>
        <CameraMotionBlur samples={10} shutterAngle={180}>
          <Front />
        </CameraMotionBlur>
      </AbsoluteFill>
      <FilmLook width={width} height={height} />
    </AbsoluteFill>
  );
};
