/**
 * テーマのカタログ（docs/experiments.md の family をトップに並べる単位）。
 * 答え（現実）はここに書かない。Planner に渡すのもこの形。
 */
export type Sensor = "accelerometer" | "gyroscope" | "microphone" | "camera" | "speaker";
export type Variable = "mass" | "length" | "amplitude" | "object" | "height" | "water" | "beat" | "distance" | "surface" | "jump";

export interface Condition {
  key: "A" | "B";
  label: string;
  setup: string;
}

export interface Variant {
  id: string;
  variable: Variable;
  title: string;
  changes: string;
  holds: string;
  conditions: [Condition, Condition];
  tolerance: number;
  unit: "s" | "Hz";
}

export interface Theme {
  id: string;
  title: string;
  /** 予想の前に、まず作って見てもらう手順 */
  build: string[];
  question: string;
  tagline: string;
  materials: string;
  sensors: Sensor[];
  seconds: number;
  safety: string;
  enabledBy: "default" | "teacher" | "later";
  measureProfile: "pendulum_period" | "pitch" | "freefall_time" | "later";
  variants: Variant[];
}

export const SENSOR_LABEL: Record<Sensor, string> = {
  accelerometer: "加速度",
  gyroscope: "ジャイロ",
  microphone: "マイク",
  camera: "カメラ",
  speaker: "スピーカー",
};

export const THEMES: Theme[] = [
  {
    id: "pendulum",
    title: "振り子の周期",
    build: ["糸（1 m 以下）の先に袋を結び、消しゴムを 1 個入れる", "机の端から垂らして、小さく振ってみる", "何回か往復を見て、速さを感じてみる。まだスマホは入れない"],
    question: "振ってみて、どう思った？　重さや糸の長さを変えたら、速さはどうなりそう？",
    tagline: "重い方が速い？　長い方が遅い？",
    materials: "糸（1 m 以下）、袋、消しゴム 2 個",
    sensors: ["accelerometer", "gyroscope"],
    seconds: 20,
    safety: "糸は1m以下、机の上で。スマホはケースに入れて袋に",
    enabledBy: "default",
    measureProfile: "pendulum_period",
    variants: [
      {
        id: "pendulum_mass",
        variable: "mass",
        title: "同じ長さの糸で、重さだけ2倍にする",
        changes: "重さ（消しゴム1個から2個へ）",
        holds: "糸の長さ、振れ幅",
        conditions: [
          { key: "A", label: "重さ 1倍", setup: "袋に消しゴムを 1 個入れて、糸で吊るす。小さく（20° 以内）振ってから「測る」" },
          { key: "B", label: "重さ 2倍", setup: "消しゴムを 2 個にする。糸の長さと振れ幅は同じままで、もう一度振る" },
        ],
        tolerance: 0.05,
        unit: "s",
      },
      {
        id: "pendulum_length",
        variable: "length",
        title: "同じ重さで、糸の長さだけ2倍にする",
        changes: "糸の長さ（50 cm から 100 cm へ）",
        holds: "重さ、振れ幅",
        conditions: [
          { key: "A", label: "長さ 50 cm", setup: "糸を 50 cm にして吊るす。小さく振ってから「測る」" },
          { key: "B", label: "長さ 100 cm", setup: "糸を 100 cm に伸ばす。重さと振れ幅は同じままで" },
        ],
        tolerance: 0.05,
        unit: "s",
      },
      {
        id: "pendulum_amplitude",
        variable: "amplitude",
        title: "同じ糸と重さで、振れ幅だけ変える",
        changes: "振れ幅（10° から 30° へ）",
        holds: "糸の長さ、重さ",
        conditions: [
          { key: "A", label: "振れ幅 小", setup: "ほんの少し（10° くらい）だけ振る" },
          { key: "B", label: "振れ幅 大", setup: "30° くらいまで振る。45° は超えない" },
        ],
        tolerance: 0.05,
        unit: "s",
      },
    ],
  },
  {
    id: "freefall",
    title: "自由落下 ― 撮って、聞く",
    build: ["コインと消しゴムを用意して、クッションの上に落としてみる", "目で見て、耳で聞いて、どっちが先に着くか感じてみる"],
    question: "コインと消しゴム、どっちが先に落ちる？",
    tagline: "スマホは落とさない。着地のコマと音、二つの時計",
    materials: "コイン、消しゴム、クッション",
    sensors: ["camera", "microphone"],
    seconds: 10,
    safety: "高さは 1 m まで。クッションの上に落とす。スマホは机に置く",
    enabledBy: "later",
    measureProfile: "freefall_time",
    variants: [
      {
        id: "freefall_mass",
        variable: "object",
        title: "コインと消しゴムを同じ高さから同時に",
        changes: "落とす物（コイン ／ 消しゴム）",
        holds: "高さ 1 m",
        conditions: [
          { key: "A", label: "コイン", setup: "1 m の高さからコインを落とす" },
          { key: "B", label: "消しゴム", setup: "同じ高さから消しゴムを落とす" },
        ],
        tolerance: 0.05,
        unit: "s",
      },
    ],
  },
  {
    id: "bottle",
    title: "ペットボトルの音",
    build: ["空のペットボトルの口に、息を吹いて音を出してみる", "水を少し入れて、もう一度吹いてみる"],
    question: "水を増やすと、音は高くなる？低くなる？",
    tagline: "口に息を吹いて、基本周波数を測る",
    materials: "ペットボトル、水、自分の息",
    sensors: ["microphone"],
    seconds: 5,
    safety: "水は机の上でこぼさないように",
    enabledBy: "later",
    measureProfile: "pitch",
    variants: [
      {
        id: "bottle_water",
        variable: "water",
        title: "同じボトルで、水の量だけ変える",
        changes: "水の量（空 → 半分）",
        holds: "ボトル、吹き方",
        conditions: [
          { key: "A", label: "空", setup: "空のボトルの口に息を吹く" },
          { key: "B", label: "水 半分", setup: "水を半分まで入れて、同じ吹き方で" },
        ],
        tolerance: 0.03,
        unit: "Hz",
      },
    ],
  },
  { id: "beat", title: "うなり", build: ["先生と一緒に準備します"], question: "二つの音の差を広げると、うなりは速くなる？", tagline: "スピーカーとマイク", materials: "スピーカー付きの端末をもう一台", sensors: ["speaker", "microphone"], seconds: 5, safety: "音量は小さく", enabledBy: "later", measureProfile: "later", variants: [] },
  { id: "echo", title: "反響で音の速さ", build: ["先生と一緒に準備します"], question: "壁が遠いほど、音は遅れて返る？", tagline: "手を叩いて往復時間", materials: "壁のある廊下", sensors: ["speaker", "microphone"], seconds: 5, safety: "廊下では走らない", enabledBy: "later", measureProfile: "later", variants: [] },
  { id: "coin_slip", title: "コインの滑り出し角", build: ["先生と一緒に準備します"], question: "ざらざらの面ほど、滑り出しは遅い？", tagline: "傾きは加速度で測る", materials: "コイン、下敷き", sensors: ["accelerometer", "gyroscope"], seconds: 10, safety: "机の上で", enabledBy: "later", measureProfile: "later", variants: [] },
  { id: "jump", title: "ジャンプの滞空時間", build: ["先生と一緒に準備します"], question: "高く跳ぶほど、空中にいる時間は長い？", tagline: "ポケットに入れて跳ぶ", materials: "靴、周囲 1 m の余裕", sensors: ["accelerometer"], seconds: 10, safety: "室内、靴をはいて。周りに人がいないこと", enabledBy: "later", measureProfile: "later", variants: [] },
  { id: "elevator", title: "エレベーターの見かけの重さ", build: ["先生と一緒に準備します"], question: "上に動き出すとき、体は重くなる？", tagline: "先生が有効化する拡張", materials: "エレベーター", sensors: ["accelerometer"], seconds: 20, safety: "先生と一緒に", enabledBy: "teacher", measureProfile: "later", variants: [] },
  { id: "spin", title: "回転の減衰", build: ["先生と一緒に準備します"], question: "回転椅子は、どう遅くなっていく？", tagline: "先生が有効化する拡張", materials: "回転椅子", sensors: ["gyroscope"], seconds: 20, safety: "先生の目の前で", enabledBy: "teacher", measureProfile: "later", variants: [] },
  { id: "pulse", title: "カメラで脈拍", build: ["先生と一緒に準備します"], question: "運動のあと、脈は何秒で戻る？", tagline: "先生が有効化する拡張。値は端末の外に出ない", materials: "自分の指", sensors: ["camera"], seconds: 20, safety: "無理に走らない", enabledBy: "teacher", measureProfile: "later", variants: [] },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
export function variantById(theme: Theme, id: string | null): Variant | undefined {
  return theme.variants.find((v) => v.id === id) ?? (id === placeholderId(theme) ? placeholderVariant(theme) : undefined);
}

/** 実験が未定義のテーマ用（テストモード）。条件 A/B を仮に置いて流れだけ通す */
export function placeholderId(theme: Theme): string {
  return `${theme.id}_test`;
}
export function placeholderVariant(theme: Theme): Variant {
  return {
    id: placeholderId(theme),
    variable: "object",
    title: `${theme.title}（テスト用の仮の実験）`,
    changes: "条件（A から B へ）",
    holds: "それ以外",
    conditions: [
      { key: "A", label: "条件 A", setup: "テストモード: 準備の手順はまだありません" },
      { key: "B", label: "条件 B", setup: "テストモード: 条件を変えたことにして進めます" },
    ],
    tolerance: 0.05,
    unit: "s",
  };
}
/** テーマの実験一覧。無ければ仮の実験 1 つ */
export function variantsOf(theme: Theme): Variant[] {
  return theme.variants.length ? theme.variants : [placeholderVariant(theme)];
}
