"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ChannelIcon } from "./ContactIcons";
import { promptsFor } from "@/lib/mtj-assistant-client";

interface Action {
  type: string;
  label: string;
  href?: string;
  goUrl?: string;
  channel?: string;
  displayMasked?: string | null;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
  ticketNumber?: string | null;
}

function guestKey(): string {
  try {
    let k = localStorage.getItem("mtj_guest_key");
    if (!k) {
      k = `g-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem("mtj_guest_key", k);
    }
    return k;
  } catch {
    return "g-fallback";
  }
}

function renderText(t: string) {
  return t.split("\n").map((line, i) => (
    <span key={i}>
      {line}
      {i < t.split("\n").length - 1 && <br />}
    </span>
  ));
}

export default function MtjAssistantPanel({
  compact = false,
  contextLabel,
}: {
  compact?: boolean;
  contextLabel?: string;
}) {
  const { user, role } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const who = role === "merchant" ? "🤖 مساعد التاجر" : "🤖 المساعد";
  const suggestions = promptsFor(role || "guest");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    setStarted(true);
    setMessages((m) => [...m, { role: "user", content }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId, guestKey: guestKey() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: d.error || "عذراً، حدث خطأ. حاول مجدداً." },
        ]);
        return;
      }
      setConversationId(d.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: d.reply,
          actions: d.actions || [],
          ticketNumber: d.ticket?.ticketNumber || null,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "تعذّر الاتصال حالياً. تحقق من الإنترنت وحاول مجدداً." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setStarted(false);
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-3xl border bg-white shadow-2xl ${compact ? "h-[480px]" : "h-[560px]"}`}>
      <div className="bg-gradient-to-l from-slate-900 via-emerald-900 to-emerald-700 p-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-xl">🤖</span>
            <div>
              <p className="text-sm font-black leading-tight">{who}</p>
              <p className="flex items-center gap-1 text-[11px] text-white/80">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                متصل الآن • يفهم السودانية 🇸🇩
              </p>
            </div>
          </div>
          {started && (
            <button
              onClick={newChat}
              className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-black transition hover:bg-white/25"
            >
              ✚ جديد
            </button>
          )}
        </div>
        {contextLabel && <p className="mt-1 text-[11px] text-white/70">{contextLabel}</p>}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
        {!started && messages.length === 0 && (
          <div className="rounded-2xl bg-white p-4 text-sm leading-relaxed shadow-sm">
            <p className="font-black">مرحباً! أنا {who} 👋</p>
            <p className="mt-1 text-slate-600">
              أساعدك في الطلبات والمحفظة والشحن والمفاوضات — أقرأ بياناتك المسموحة فقط، وأحوّلك لفريق
              بشري عند الحاجة. جرّب أحد الأسئلة:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-start" : "flex justify-end"}>
            <div
              className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "rounded-br-md bg-emerald-700 text-white"
                  : "rounded-bl-md bg-white text-slate-800"
              }`}
            >
              {m.role === "assistant" && (
                <p className="mb-1 text-[11px] font-black text-emerald-700">{who}</p>
              )}
              <div className="whitespace-pre-wrap">{renderText(m.content)}</div>
              {m.ticketNumber && (
                <p className="mt-2 rounded-xl bg-amber-100 p-2 text-center text-xs font-black text-amber-800">
                  🎫 رقم التذكرة: <span className="font-mono" dir="ltr">{m.ticketNumber}</span>
                </p>
              )}
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.actions.map((a, j) => {
                    if (a.type === "channels" && a.goUrl) {
                      return (
                        <a
                          key={j}
                          href={a.goUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black text-white transition hover:opacity-90 ${
                            a.channel === "whatsapp" ? "bg-[#25D366]" : "bg-gradient-to-l from-[#006AFF] to-[#A855F7]"
                          }`}
                        >
                          <ChannelIcon channel={a.channel || "whatsapp"} size={15} />
                          {a.label}
                        </a>
                      );
                    }
                    return (
                      <a
                        key={j}
                        href={a.href || "#"}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-black text-white transition hover:bg-slate-700"
                      >
                        {a.label}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-end">
            <div className="rounded-2xl rounded-bl-md bg-white p-3 shadow-sm">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500" style={{ animationDelay: "0.15s" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500" style={{ animationDelay: "0.3s" }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t bg-white p-2.5">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={user ? `اسأل ${who}... (عربي أو سوداني)` : "اسأل كزائر... (سجّل الدخول لبياناتك الخاصة)"}
            className="input-field flex-1"
            maxLength={2000}
          />
          <button onClick={() => send()} disabled={busy || !input.trim()} className="btn-primary !px-4 disabled:opacity-50">
            {busy ? "⏳" : "➤"}
          </button>
        </div>
        <p className="mt-1 text-center text-[10px] text-slate-400">
          🔒 {who} يقرأ بياناتك المسموحة فقط ولا يشارك أسرارك • لستُ من الإدارة
        </p>
      </div>
    </div>
  );
}
