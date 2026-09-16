import { useEffect, useRef, useState } from "react";
import { Button, Card, CardBody, CardTitle, Eyebrow, Field, Foot, FootNote, Note, Screen, Section } from "../components/ui";
import type { Theme, Variant } from "../catalog/themes";
import {
  CHAT_TURNS_PER_RECORD,
  ChatError,
  MIN_THINKING_CHARS,
  canReveal,
  canStart,
  chatRequestFor,
  chatSituation,
  holdReasons,
  sendChat,
  studentThinking,
  type ChatReply,
  type ChatSituation,
} from "../agent/chat";
import type { ChatLog, StudyRecord } from "../store/records";
import "./chat.css";

export interface ChatProps {
  rec: StudyRecord;
  theme: Theme;
  variant: Variant;
  onThinking: (text: string) => void;
  onTurn: (studentText: string, reply: ChatReply) => void;
  onBack: () => void;
  onHome: () => void;
}

const TITLE: Record<ChatSituation, string> = {
  hold: "保留になった理由を、いっしょに考えよう",
  mismatch: "予想と違ったわけを、いっしょに考えよう",
  match: "予想どおりになったわけを、深めよう",
  unjudged: "測定が言っていることを、いっしょに読もう",
};

const ASK: Record<ChatSituation, string> = {
  hold: "どうして保留になったと思う？　まず自分の考えを書こう",
  mismatch: "どうして予想と違ったと思う？　まず自分の考えを書こう",
  match: "どうして予想どおりになったと思う？　まず自分の考えを書こう",
  unjudged: "測定の結果を見て、どう思った？　まず自分の考えを書こう",
};

const REVEAL_MESSAGE = "ラボ先生の説明を聞かせてください";
const EMPTY_CHAT: ChatLog = { thinking: "", messages: [], revealed: false, turnsUsed: 0, limitReached: false };

/** ラボ先生とのふり返り。自分の考えを書くと話しはじめられ、先生の説明も聞けるようになる */
export function Chat({ rec, theme, variant, onThinking, onTurn, onBack, onHome }: ChatProps) {
  const situation = chatSituation(rec);
  const chat = rec.chat ?? EMPTY_CHAT;
  const started = chat.messages.length > 0;
  const [draft, setDraft] = useState(studentThinking(rec));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const turnsLeft = Math.max(0, CHAT_TURNS_PER_RECORD - chat.turnsUsed);
  const reasons = situation === "hold" ? holdReasons(rec) : [];
  const revealable = canReveal(chat.thinking, situation);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages.length, sending]);

  async function send(text: string, reveal: boolean, base: StudyRecord = rec) {
    const trimmed = text.trim();
    if (sending || !trimmed) return;
    setSending(true);
    setError(null);
    try {
      const reply = await sendChat(chatRequestFor({ rec: base, theme, variant, school: theme.school, message: trimmed, reveal }));
      onTurn(trimmed, reply);
      setMessage("");
    } catch (e: unknown) {
      setError(e instanceof ChatError ? e.message : "ラボ先生につながりませんでした。少し待ってから、もう一度");
    } finally {
      setSending(false);
    }
  }

  function start() {
    const thinking = draft.trim();
    if (!canStart(thinking)) return;
    onThinking(thinking);
    void send(thinking, false, { ...rec, chat: { ...chat, thinking } });
  }

  return (
    <Screen badge="ラボ先生" tone="orange" onHome={onHome}>
      <Card variant="navy">
        <Eyebrow>
          {theme.title}　{variant.title}
        </Eyebrow>
        <CardTitle>{TITLE[situation]}</CardTitle>
        {rec.result && <CardBody>測定が言っていること：{rec.result.statement}</CardBody>}
        {reasons.length > 0 && (
          <ul className="chat-reasons">
            {reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </Card>

      {!started ? (
        <Section label={ASK[situation]}>
          <Field
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder={situation === "hold" ? "たとえば：まわりの音が大きかったから…" : "たとえば：変えたのは〇〇だけなのに…"}
            style={{ borderColor: "var(--orange)" }}
          />
          <p className="card__hint">
            {!canStart(draft)
              ? `${MIN_THINKING_CHARS} 文字以上で書くと、ラボ先生と話せます`
              : situation === "hold"
                ? "送ると、ラボ先生と話しはじめます。説明は、測れて結果が出てから聞けます"
                : "送ると、ラボ先生と話しはじめます。ラボ先生の説明も聞けるようになります"}
          </p>
          <Button disabled={!canStart(draft) || sending} onClick={start}>
            {sending ? "ラボ先生が考えています…" : "考えを送って、ラボ先生と話す"}
          </Button>
        </Section>
      ) : (
        <div className="chat-thread" aria-live="polite">
          {chat.messages.map((m, i) => (
            <p key={i} className={`bubble bubble--${m.role}`}>
              <span className="bubble__who">{m.role === "teacher" ? "ラボ先生" : "あなた"}</span>
              {m.text}
            </p>
          ))}
          {sending && (
            <p className="bubble bubble--teacher bubble--typing">
              <span className="bubble__who">ラボ先生</span>
              考えています…
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && <Note>{error}</Note>}

      {started && !chat.limitReached && (
        <div className="chat-input">
          {!chat.revealed && revealable && (
            <Button secondary disabled={sending} onClick={() => void send(REVEAL_MESSAGE, true)}>
              ラボ先生の説明を聞く
            </Button>
          )}
          <Field value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} placeholder="ラボ先生に聞きたいこと、思ったこと" />
          <Button disabled={sending || !message.trim()} onClick={() => void send(message, false)}>
            送る
          </Button>
        </div>
      )}

      <Foot>
        <FootNote>
          {chat.limitReached
            ? "この記録でラボ先生と話せる回数は終わりました"
            : situation === "hold"
              ? `ラボ先生と話せるのは、あと ${turnsLeft} 回です。説明は、測れて結果が出てから聞けます`
              : chat.revealed
                ? `ラボ先生と話せるのは、あと ${turnsLeft} 回です`
                : `ラボ先生と話せるのは、あと ${turnsLeft} 回です。説明は、自分の考えを書いたあとで聞けます`}
        </FootNote>
        <Button secondary onClick={onBack}>
          {rec.result ? "結果に戻る" : "保留の画面に戻る"}
        </Button>
      </Foot>
    </Screen>
  );
}
