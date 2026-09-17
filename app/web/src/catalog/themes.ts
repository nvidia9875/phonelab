/**
 * テーマのカタログ（docs/experiments.md の family をトップに並べる単位）。
 * 答え（現実）はここに書かない。Planner に渡すのもこの形。
 * 学校種（中学 / 高校）で入口を分ける（docs/curriculum-coverage.md §5）。
 */
import type { Unit } from "./quantity";

export type Sensor = "accelerometer" | "gyroscope" | "microphone" | "camera" | "speaker";
export type Variable = "mass" | "length" | "amplitude" | "object" | "height" | "water" | "beat" | "distance" | "surface" | "jump" | "strength";
export type School = "jhs" | "hs";
/** 端末の段階（docs/curriculum-coverage.md 2.3）。T0 カメラ・マイク / T1 ＋加速度 / T2 ＋方位 */
export type Tier = "T0" | "T1" | "T2";
export type MeasureProfile = "pendulum_period" | "pendulum_speed" | "pitch" | "freefall_time" | "later";

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
  /** abs: 単位そのまま / rel: 条件 A の値に対する割合（音） */
  toleranceKind: "abs" | "rel";
  unit: Unit;
  /** 振り子の糸の長さ（最下点の速さの計算に使う） */
  lengthM?: number;
  /** 1 条件を何回測って平均するか（既定 1）。手で放す高さのように、毎回ぶれる実験で 3 にする */
  repeats?: number;
}

export interface Theme {
  id: string;
  school: School;
  grade?: number;
  /** カードに出す学年と単元（中学）または科目と単元（高校） */
  course: string;
  curriculumRef: string[];
  minTier: Tier;
  title: string;
  /** 予想の前に、まず作って見てもらう手順 */
  build: string[];
  question: string;
  /** 予想の入力欄の例（理由まで書く形を見せる） */
  example: string;
  tagline: string;
  materials: string;
  sensors: Sensor[];
  seconds: number;
  safety: string;
  /** 準備画面の「測る」の直前に出す一文 */
  measureHint: string;
  /** カウントダウンの 0 で大きく出す合図 */
  goCue: string;
  enabledBy: "default" | "teacher" | "later";
  /** 先生が有効化して、家（私物の端末）でやる実験。学校種をまたいでカタログに出る（docs/personas.md §3） */
  home?: boolean;
  measureProfile: MeasureProfile;
  variants: Variant[];
}

export const SENSOR_LABEL: Record<Sensor, string> = {
  accelerometer: "加速度",
  gyroscope: "ジャイロ",
  microphone: "マイク",
  camera: "カメラ",
  speaker: "スピーカー",
};

const PENDULUM_LENGTH_M = 0.8;
/** 放す高さは手で合わせるので毎回ぶれる。3 回測って平均する（音は 5 秒の中で何十回分を中央値にしているので 1 回） */
const PENDULUM_REPEATS = 3;
const SPEED_TOLERANCE_MS = 0.15;
const PITCH_TOLERANCE_REL = 0.03;
const PERIOD_TOLERANCE_S = 0.05;

type Later = Omit<Theme, "variants" | "build" | "measureHint" | "enabledBy" | "measureProfile" | "example" | "goCue"> & Partial<Pick<Theme, "enabledBy">>;
function later(t: Later): Theme {
  return { build: ["先生と一緒に準備します"], example: "たとえば：〇〇を変えると、△△になると思う。理由は…", measureHint: "準備中です", goCue: "スタート！", enabledBy: "later", measureProfile: "later", variants: [], ...t };
}

const CATALOG: Theme[] = [
  /* ---------- 中学 ---------- */
  {
    id: "energy",
    school: "jhs",
    grade: 3,
    course: "中3 運動とエネルギー",
    curriculumRef: ["中学 第1分野(5)ア(ｳ)㋑ 力学的エネルギーの保存", "J3-15"],
    minTier: "T1",
    title: "振り子とエネルギー",
    build: ["糸（80 cm）の先に袋を結び、消しゴムを 1 個入れる", "袋を少し持ち上げて、押さずにそっと放してみる", "高く持ち上げたときと低いときで、いちばん下を通る速さを見くらべる。まだ端末は入れない"],
    question: "放してみて、どう思った？　高さや重さを変えたら、いちばん下を通る速さはどうなりそう？",
    example: "たとえば：高いところから放すと勢いがつくから、いちばん下で速くなると思う",
    tagline: "高くから放すと速い？　重いと速い？",
    materials: "糸（80 cm）、袋、消しゴム 2 個、ものさし",
    sensors: ["accelerometer", "gyroscope"],
    seconds: 10,
    safety: "糸は 1 m 以下、机の上で。端末はケースに入れて袋に。押さずに放す",
    measureHint: "端末は袋に入れたまま。「測る」を押すと 3, 2, 1 の合図が出ます。0 で、押さずにそっと放します",
    goCue: "そっと放して！",
    enabledBy: "default",
    measureProfile: "pendulum_speed",
    variants: [
      {
        id: "energy_height",
        variable: "height",
        title: "同じ重さで、放す高さだけ2倍にする",
        changes: "放す高さ（10 cm から 20 cm へ）",
        holds: "重さ、糸の長さ 80 cm",
        conditions: [
          { key: "A", label: "高さ 10 cm", setup: "袋の底を、いちばん下の位置からものさしで 10 cm 持ち上げて持つ" },
          { key: "B", label: "高さ 20 cm", setup: "同じ袋のまま、今度は 20 cm 持ち上げて持つ" },
        ],
        tolerance: SPEED_TOLERANCE_MS,
        toleranceKind: "abs",
        unit: "m/s",
        lengthM: PENDULUM_LENGTH_M,
        repeats: PENDULUM_REPEATS,
      },
      {
        id: "energy_mass",
        variable: "mass",
        title: "同じ高さから、重さだけ増やして放す",
        changes: "重さ（消しゴムを 1 個足す。端末も入っているので 2 倍にはならない）",
        holds: "放す高さ 15 cm、糸の長さ 80 cm",
        conditions: [
          { key: "A", label: "消しゴム 1 個", setup: "消しゴム 1 個で、袋の底を 15 cm 持ち上げて持つ" },
          { key: "B", label: "消しゴム 2 個", setup: "消しゴムを 2 個にして、同じ 15 cm 持ち上げて持つ" },
        ],
        tolerance: SPEED_TOLERANCE_MS,
        toleranceKind: "abs",
        unit: "m/s",
        lengthM: PENDULUM_LENGTH_M,
        repeats: PENDULUM_REPEATS,
      },
    ],
  },
  {
    id: "sound",
    school: "jhs",
    grade: 1,
    course: "中1 身のまわりの現象（音）",
    curriculumRef: ["中学 第1分野(1)ア(ｱ)㋒ 音の性質", "J1-16"],
    minTier: "T0",
    title: "音の高さ",
    build: ["ティッシュの空き箱に輪ゴムをかける", "輪ゴムを指ではじいて、音を聞いてみる", "弱くはじいたり、強くはじいたり、真ん中を押さえたりして、音のちがいを耳でたしかめる"],
    question: "はじいてみて、どう思った？　強さや長さを変えたら、音の高さはどうなりそう？",
    example: "たとえば：強くはじくとゴムが速く震えるから、音が高くなると思う",
    tagline: "強くはじくと高くなる？　短くすると？",
    materials: "輪ゴム、ティッシュの空き箱",
    sensors: ["microphone"],
    seconds: 5,
    safety: "輪ゴムを人に向けて飛ばさない。耳の近くではじかない",
    measureHint: "端末は箱の横の机に置き、画面はこのまま。3, 2, 1 のあと「はじいて！」の合図で、何回かはじきます",
    goCue: "はじいて！",
    enabledBy: "default",
    measureProfile: "pitch",
    variants: [
      {
        id: "sound_pluck_strength",
        variable: "strength",
        title: "同じ輪ゴムで、はじく強さだけ変える",
        changes: "はじく強さ（弱く から 強く へ）",
        holds: "輪ゴムの長さと張り",
        conditions: [
          { key: "A", label: "弱く", setup: "輪ゴムを弱くはじく。毎回同じくらいの弱さで" },
          { key: "B", label: "強く", setup: "同じ輪ゴムを、今度は強くはじく。長さと張りはそのまま" },
        ],
        tolerance: PITCH_TOLERANCE_REL,
        toleranceKind: "rel",
        unit: "Hz",
      },
      {
        id: "sound_string_length",
        variable: "length",
        title: "同じ強さで、震える長さだけ短くする",
        changes: "震える部分の長さ（そのまま から 半分 へ）",
        holds: "輪ゴム、はじく強さ",
        conditions: [
          { key: "A", label: "長さ そのまま", setup: "輪ゴムを押さえずに、そのままはじく" },
          { key: "B", label: "長さ 半分", setup: "輪ゴムの真ん中を指で押さえ、片側だけを同じ強さではじく" },
        ],
        tolerance: PITCH_TOLERANCE_REL,
        toleranceKind: "rel",
        unit: "Hz",
      },
    ],
  },
  {
    id: "bottle",
    school: "jhs",
    grade: 1,
    course: "中1 音（発展）",
    curriculumRef: ["中学 第1分野(1)ア(ｱ)㋒ 音の性質"],
    minTier: "T0",
    title: "ペットボトルの音",
    build: [
      "500 mL くらいの、口の細いペットボトルを用意する（大きいボトルは音が低く、出しにくい）",
      "下くちびるをボトルの口のふちに軽く当て、口の横から細く息を吹きかける。むずかしければ、ボトルの口を手のひらでポンとたたいて音を出す",
      "水を少し入れて、同じやり方で鳴らしてみる",
    ],
    question: "水を増やすと、音は高くなる？低くなる？",
    example: "たとえば：水を入れるとボトルが重くなるから、音が低くなると思う",
    tagline: "吹くか、口をポンとたたいて、音の高さを測る",
    materials: "500 mL くらいの細口ペットボトル、水",
    sensors: ["microphone"],
    seconds: 5,
    safety: "水は机の上でこぼさないように",
    measureHint: "端末はボトルの近くの机に置く。3, 2, 1 のあと「鳴らして！」の合図で、同じやり方で何回か",
    goCue: "鳴らして！",
    enabledBy: "default",
    measureProfile: "pitch",
    variants: [
      {
        id: "bottle_water",
        variable: "water",
        title: "同じボトルで、水の量だけ変える",
        changes: "水の量（空 → 半分）",
        holds: "ボトル、鳴らし方",
        conditions: [
          { key: "A", label: "空", setup: "空のボトルを、吹くか、口をポンとたたくかで鳴らす" },
          { key: "B", label: "水 半分", setup: "水を半分まで入れて、同じやり方で鳴らす" },
        ],
        tolerance: PITCH_TOLERANCE_REL,
        toleranceKind: "rel",
        unit: "Hz",
      },
    ],
  },
  later({ id: "echo", school: "jhs", grade: 1, course: "中1 音の伝わり方", curriculumRef: ["中学 第1分野(1)ア(ｱ)㋒"], minTier: "T0", title: "反響で音の速さ", question: "壁が遠いほど、音は遅れて返る？", tagline: "手を叩いて往復時間", materials: "壁のある廊下", sensors: ["speaker", "microphone"], seconds: 5, safety: "廊下では走らない" }),
  later({ id: "coin_slip", school: "jhs", grade: 1, course: "中1 力のはたらき（発展）", curriculumRef: ["中学 第1分野(1)ア(ｲ)㋐"], minTier: "T1", title: "コインの滑り出し角", question: "ざらざらの面ほど、滑り出しは遅い？", tagline: "傾きは加速度で測る", materials: "コイン、下敷き", sensors: ["accelerometer", "gyroscope"], seconds: 10, safety: "机の上で" }),

  /* ---------- 高校 ---------- */
  {
    id: "pendulum",
    school: "hs",
    course: "物理 単振動",
    curriculumRef: ["高校 物理 (1)(ｳ)㋑ 単振動", "共通テスト 令和7年度 物理 第2問"],
    minTier: "T1",
    title: "振り子の周期",
    home: true,
    build: ["糸（1 m 以下）の先に袋を結び、消しゴムを 1 個入れる", "机の端から垂らして、小さく振ってみる", "何回か往復を見て、速さを感じてみる。まだスマホは入れない"],
    question: "振ってみて、どう思った？　重さや糸の長さを変えたら、周期はどうなりそう？",
    example: "たとえば：重くすると引っ張られる力が強いから、速く振れると思う",
    tagline: "家で、自分のスマホを袋に入れて振る。重い方が速い？　長い方が遅い？",
    materials: "糸（1 m 以下）、袋、消しゴム 2 個、加速度センサーのあるスマホ",
    sensors: ["accelerometer", "gyroscope"],
    seconds: 20,
    safety: "糸は1m以下、机の上で。スマホはケースに入れて袋に",
    measureHint: "スマホは袋に入れたまま、画面はこのまま。小さく振ってから「測る」を押します",
    goCue: "そのまま振って！",
    enabledBy: "teacher",
    measureProfile: "pendulum_period",
    variants: [
      {
        id: "pendulum_mass",
        variable: "mass",
        title: "同じ長さの糸で、重さだけ増やす",
        changes: "重さ（消しゴムを 1 個足す。端末も入っているので 2 倍にはならない）",
        holds: "糸の長さ、振れ幅",
        conditions: [
          { key: "A", label: "消しゴム 1 個", setup: "袋に消しゴムを 1 個入れて、糸で吊るす。小さく（20° 以内）振ってから「測る」" },
          { key: "B", label: "消しゴム 2 個", setup: "消しゴムを 2 個にする。糸の長さと振れ幅は同じままで、もう一度振る" },
        ],
        tolerance: PERIOD_TOLERANCE_S,
        toleranceKind: "abs",
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
        tolerance: PERIOD_TOLERANCE_S,
        toleranceKind: "abs",
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
        tolerance: PERIOD_TOLERANCE_S,
        toleranceKind: "abs",
        unit: "s",
      },
    ],
  },
  later({ id: "freefall", school: "hs", course: "物理基礎 落下運動", curriculumRef: ["高校 物理基礎 (1)(ｲ)㋓", "H-PB-05"], minTier: "T0", title: "自由落下 ― 撮って、聞く", question: "コインと消しゴム、どっちが先に落ちる？", tagline: "スマホは落とさない。着地のコマと音、二つの時計", materials: "コイン、消しゴム、クッション", sensors: ["camera", "microphone"], seconds: 10, safety: "高さは 1 m まで。クッションの上に落とす。スマホは机に置く" }),
  later({ id: "beat", school: "hs", course: "物理基礎 音と振動", curriculumRef: ["高校 物理基礎 (2)(ｱ)㋑", "H-PB-18"], minTier: "T0", title: "うなり", question: "二つの音の差を広げると、うなりは速くなる？", tagline: "スピーカーとマイク", materials: "スピーカー付きの端末をもう一台", sensors: ["speaker", "microphone"], seconds: 5, safety: "音量は小さく" }),
  later({ id: "jump", school: "hs", course: "物理基礎（発展）", curriculumRef: ["高校 物理基礎 (1)(ｲ)㋓"], minTier: "T1", title: "ジャンプの滞空時間", question: "高く跳ぶほど、空中にいる時間は長い？", tagline: "ポケットに入れて跳ぶ", materials: "靴、周囲 1 m の余裕", sensors: ["accelerometer"], seconds: 10, safety: "室内、靴をはいて。周りに人がいないこと" }),
  later({ id: "elevator", school: "hs", course: "物理基礎 運動の法則", curriculumRef: ["H-PB-03"], minTier: "T1", title: "エレベーターの見かけの重さ", question: "上に動き出すとき、体は重くなる？", tagline: "先生が有効化する拡張", materials: "エレベーター", sensors: ["accelerometer"], seconds: 20, safety: "先生と一緒に", enabledBy: "teacher" }),
  later({ id: "spin", school: "hs", course: "物理 円運動", curriculumRef: ["高校 物理 (1)(ｳ)㋐"], minTier: "T1", title: "回転の減衰", question: "回転椅子は、どう遅くなっていく？", tagline: "先生が有効化する拡張", materials: "回転椅子", sensors: ["gyroscope"], seconds: 20, safety: "先生の目の前で", enabledBy: "teacher" }),
  later({ id: "pulse", school: "hs", course: "生物基礎 体内環境", curriculumRef: ["H-BB-10"], minTier: "T0", title: "カメラで脈拍", question: "運動のあと、脈は何秒で戻る？", tagline: "先生が有効化する拡張。値は端末の外に出ない", materials: "自分の指", sensors: ["camera"], seconds: 20, safety: "無理に走らない", enabledBy: "teacher" }),
];

/**
 * 教科書の流れ。トップの番号と並びはこの順。
 * 中学: 東京書籍『新編 新しい科学』令和7年度版の 学年 → 単元 → 章（中1 単元3「身のまわりの現象」は 光 → 音 → 力、音の章は 伝わり方 → 大きさと高さ）。
 * 高校: 科目は 物理基礎 → 物理 → 生物基礎、科目の中は教科書の章の順（物理基礎は 落下運動 → 運動の法則 → 音、物理は 円運動 → 単振動）。
 * ここに無いテーマは消さずに末尾へ回す。
 */
const TEXTBOOK_ORDER = ["echo", "sound", "bottle", "coin_slip", "energy", "freefall", "jump", "elevator", "beat", "spin", "pendulum", "pulse"];

function textbookRank(id: string): number {
  const i = TEXTBOOK_ORDER.indexOf(id);
  return i < 0 ? TEXTBOOK_ORDER.length : i;
}

export const THEMES: Theme[] = [...CATALOG].sort((a, b) => textbookRank(a.id) - textbookRank(b.id));

/** 入口の学校種のテーマに、先生が有効化した「家でやる実験」を学校種をまたいで足す（教科書の順のまま） */
export function themesFor(school: School, teacherEnabled: readonly string[] = []): Theme[] {
  return THEMES.filter((t) => t.school === school || (t.home && teacherEnabled.includes(t.id)));
}

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
    tolerance: PERIOD_TOLERANCE_S,
    toleranceKind: "abs",
    unit: "s",
  };
}
/** テーマの実験一覧。無ければ仮の実験 1 つ */
/** 1 条件を何回測るか（既定 1） */
export function repeatsOf(variant: Variant): number {
  return variant.repeats ?? 1;
}

export function variantsOf(theme: Theme): Variant[] {
  return theme.variants.length ? theme.variants : [placeholderVariant(theme)];
}
