import type { Language } from "../shared/contracts";

const en = {
  appName: "Go Shinan",
  subtitle: "Offline human-style Go coaching",
  black: "Black",
  white: "White",
  toPlay: "to play",
  move: "Move",
  captures: "Captures",
  difficulty: "Difficulty",
  approximate: "Approximate human-style",
  engine: "Engine",
  engineReady: "Ready",
  engineBusy: "Analyzing",
  engineMissing: "Assets missing",
  engineError: "Unavailable",
  loading: "Opening session…",
  thinking: "Studying the position…",
  assessing: "Assessing your move…",
  opponent: "Opponent is thinking…",
  coaching: "Retry required",
  errorStreak: "Mistake streak",
  newGame: "New game",
  undo: "Undo",
  pass: "Pass",
  resign: "Resign",
  save: "Save SGF",
  load: "Load SGF",
  candidates: "Candidates",
  ownership: "Ownership",
  language: "日本語",
  revealHint: "Reveal next hint",
  tryAgain: "Place a better move on the board.",
  retryOpponent: "Retry opponent move",
  noEngine:
    "Add verified KataGo resources to enable analysis. Legal moves remain playable locally.",
  uncertainAccepted:
    "Analysis was unavailable or uncertain, so the move was accepted.",
  badMove:
    "This move was accepted, but it exceeded the current coaching threshold.",
  retryBad:
    "That retry is still outside the current threshold. Try another move.",
  illegal: "Illegal move",
  confirmNew: "Start a new game? The current session will be replaced.",
  confirmResign: "Resign this game?",
  sgfError: "Could not load this SGF",
  scoreLoss: "Estimated loss",
  points: "points",
  recommendedRegion: "Region to reconsider",
  principalVariation: "Short variation",
  candidateLabel: "Candidate",
  boardLabel: "19 by 19 Go board",
  empty: "empty",
  occupiedBy: "occupied by",
  "coach.self_atari":
    "This move likely creates a liberty, capture, or ko problem. Check the local tactical sequence first.",
  "coach.urgent_threat":
    "This move likely overlooks an urgent threat. Identify what the opponent can do immediately.",
  "coach.endangered_group":
    "A group appears unsettled or endangered. Reconsider whether playing elsewhere is safe.",
  "coach.ownership_swing":
    "The alternatives create a large local ownership swing. Focus on the highlighted region.",
  "coach.low_value":
    "This area appears small while a larger or more urgent move remains elsewhere.",
  "coach.overconcentration":
    "This move may duplicate work around stones that are already strong.",
  "coach.endgame_timing":
    "The move value appears too small for the current endgame timing.",
  "coach.generic":
    "This move gives up a stable amount of score. Compare its purpose with the stronger alternative.",
} as const;

type MessageKey = keyof typeof en;
const ja: Record<MessageKey, string> = {
  appName: "碁指南",
  subtitle: "オフライン人間風囲碁コーチ",
  black: "黒",
  white: "白",
  toPlay: "番",
  move: "手数",
  captures: "アゲハマ",
  difficulty: "棋力",
  approximate: "人間風・推定",
  engine: "エンジン",
  engineReady: "準備完了",
  engineBusy: "解析中",
  engineMissing: "素材不足",
  engineError: "利用不可",
  loading: "対局を開いています…",
  thinking: "局面を検討中…",
  assessing: "着手を評価中…",
  opponent: "相手が考えています…",
  coaching: "打ち直しが必要です",
  errorStreak: "連続ミス",
  newGame: "新規対局",
  undo: "待った",
  pass: "パス",
  resign: "投了",
  save: "SGF保存",
  load: "SGF読込",
  candidates: "候補手",
  ownership: "地合い予測",
  language: "English",
  revealHint: "次のヒント",
  tryAgain: "盤上により良い手を打ってください。",
  retryOpponent: "相手の着手を再試行",
  noEngine:
    "検証済みKataGo素材を追加すると解析できます。合法手はローカルで着手できます。",
  uncertainAccepted: "解析不能または不確実だったため、着手を受け入れました。",
  badMove: "着手は受け入れましたが、現在の指導基準を超えています。",
  retryBad: "この打ち直しも現在の基準外です。別の手を試してください。",
  illegal: "非合法手",
  confirmNew: "現在の対局を置き換えて新規対局を始めますか？",
  confirmResign: "この対局を投了しますか？",
  sgfError: "このSGFを読み込めませんでした",
  scoreLoss: "推定損失",
  points: "目",
  recommendedRegion: "再考する領域",
  principalVariation: "短い変化図",
  candidateLabel: "候補",
  boardLabel: "19路盤",
  empty: "空点",
  occupiedBy: "石",
  "coach.self_atari":
    "この手には、ダメ・取り・コウの問題がありそうです。まず局所の手順を確認してください。",
  "coach.urgent_threat":
    "相手の急所を見落としている可能性があります。相手の次の一手を確認してください。",
  "coach.endangered_group":
    "不安定または危険な一団があります。他所へ回って安全か再考してください。",
  "coach.ownership_swing":
    "選択によって局所の地合い予測が大きく変わります。強調された領域に注目してください。",
  "coach.low_value":
    "より大きい、または急ぐ場所が残る中で、この場所は小さいようです。",
  "coach.overconcentration":
    "すでに強い石の周りで働きが重複している可能性があります。",
  "coach.endgame_timing": "現在のヨセでは、この手の価値が小さすぎるようです。",
  "coach.generic":
    "安定して目数を損する手です。より強い候補手と狙いを比較してください。",
};

export type Translator = (key: MessageKey) => string;
export const translator =
  (language: Language): Translator =>
  (key) =>
    language === "ja" ? ja[key] : en[key];
