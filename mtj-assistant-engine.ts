import {
  ASSISTANT_NAME,
  ASSISTANT_NAME_MERCHANT,
  detectIntent,
  scanMessageRisk,
  decideEscalation,
  toolGetWallet,
  toolGetOrders,
  toolGetOrderDetail,
  toolGetNegotiations,
  toolGetWithdrawals,
  toolGetPlatformChannels,
  toolSearchProducts,
  toolGetMerchantKyc,
  categorizeFromIntent,
  calmingLine,
  fraudWarningLine,
  orderStatusAr,
  fmtMoney,
  maskPhone,
  type AssistantUser,
  type ChatHistoryItem,
  type RiskFlag,
  type Intent,
} from "./mtj-assistant";

export interface AssistantAction {
  type: "link" | "channels" | "ticket" | "orders" | "wallet";
  label: string;
  href?: string;
  channelId?: string;
  goUrl?: string;
  channel?: string;
  displayMasked?: string | null;
}

export interface AssistantTurnResult {
  reply: string;
  intent: Intent;
  confidence: number;
  sentiment: string;
  dialectHits: string[];
  toolsUsed: string[];
  toolFacts: string[];
  riskFlags: RiskFlag[];
  escalation: { shouldEscalate: boolean; autoCreate: boolean; severity: string; reason: string };
  actions: AssistantAction[];
  ticketRequest: null | {
    category: string;
    severity: "normal" | "high" | "critical";
    subject: string;
    orderId: string | null;
    reason: string;
  };
}

function assistantNameFor(role: string): string {
  return role === "merchant" ? ASSISTANT_NAME_MERCHANT : ASSISTANT_NAME;
}

function paymentMethodAr(m: string): string {
  if (m === "cash") return "نقدي عند الاستلام";
  if (m === "wallet") return "من رصيد المحفظة";
  if (m === "electronic") return "إلكتروني";
  if (m === "external_transfer") return "تحويل خارجي";
  return m;
}

function orderLink(id: string): string {
  return `/orders/${id}`;
}

export async function runAssistantTurn(params: {
  user: AssistantUser;
  message: string;
  history: ChatHistoryItem[];
}): Promise<AssistantTurnResult> {
  const { user, message, history } = params;
  const who = assistantNameFor(user.role);
  const detected = detectIntent(message);
  const riskFlags = scanMessageRisk(message);
  const escalation = decideEscalation(detected.intent, detected.sentiment, riskFlags, history, message);

  const toolsUsed: string[] = [];
  const toolFacts: string[] = [];
  const actions: AssistantAction[] = [];
  const parts: string[] = [];

  const calm = calmingLine(detected.sentiment);
  if (calm) parts.push(calm);
  const warn = fraudWarningLine(riskFlags);
  if (warn) parts.push(warn);

  const pushChannelsAction = async () => {
    const ch = await toolGetPlatformChannels();
    toolsUsed.push("get_platform_channels");
    const list = (ch.data?.channels as Array<{ id: string; channel: string; label: string | null; displayMasked: string | null; goUrl: string }>) || [];
    for (const c of list.slice(0, 2)) {
      actions.push({
        type: "channels",
        label: c.channel === "whatsapp" ? "واتساب الدعم" : "ماسنجر الدعم",
        channelId: c.id,
        goUrl: c.goUrl,
        channel: c.channel,
        displayMasked: c.displayMasked,
      });
    }
  };

  switch (detected.intent) {
    case "greeting": {
      const name = user.name ? `، ${user.name}` : "";
      parts.push(
        `مرحباً بك${name}! 👋 أنا ${who} في منصة متجرك 🇸🇩 — أساعدك في الطلبات والمحفظة والشحن والمفاوضات. كيف أخدمك اليوم؟`
      );
      break;
    }
    case "thanks": {
      parts.push(`العفو، سعيد بخدمتك دائماً! 🙏 إذا احتجت إلى أي شيء آخر بخصوص طلباتك أو محفظتك، فأنا هنا.`);
      break;
    }
    case "identity_question": {
      parts.push(
        `أنا ${who} — وكيل ذكي تابع لمنصة متجرك 🇸🇩، أقرأ بياناتك المسموح بها فقط (كطلباتك ورصيدك) لمساعدتك، ولا أطّلع على أي أسرار. وللتوضيح: لستُ من الإدارة ولا أتخذ قرارات إدارية، وعند الحاجة أحوّلك إلى فريق الدعم البشري.`
      );
      break;
    }
    case "wallet_balance": {
      const r = await toolGetWallet(user);
      toolsUsed.push("get_wallet");
      if (!r.ok) {
        parts.push(r.denied || "تعذّر جلب الرصيد.");
        if (!user.id) actions.push({ type: "link", label: "تسجيل الدخول", href: "/auth/login" });
        break;
      }
      const d = r.data as { available: string; pending: string; locked: string; commissionDue: string | null };
      toolFacts.push(`الرصيد المتاح ${d.available} ج.س`);
      if (user.role === "admin" || user.role === "super_admin") {
        parts.push(
          `رصيد محفظة المنصة الحالي:\n• المتاح: ${fmtMoney(d.available)}\n• المعلق: ${fmtMoney(d.pending)}\n• المحجوز: ${fmtMoney(d.locked)}`
        );
        actions.push({ type: "link", label: "اللوحة المالية", href: "/admin?section=finance" });
      } else {
        parts.push(
          `رصيد محفظتك الحالي:\n• المتاح: ${fmtMoney(d.available)}\n• المعلق: ${fmtMoney(d.pending)}\n• المحجوز: ${fmtMoney(d.locked)}`
        );
        if (d.commissionDue && Number(d.commissionDue) > 0) {
          parts.push(`⚠️ لديك عمولة مستحقة للمنصة قدرها ${fmtMoney(d.commissionDue)} — تُخصم تلقائياً من أول إيداعٍ أو تسويةٍ قادمة.`);
          toolFacts.push(`عمولة مستحقة ${d.commissionDue}`);
        }
        actions.push({ type: "wallet", label: "فتح المحفظة 💰", href: "/wallet" });
      }
      break;
    }
    case "order_status": {
      if (detected.orderRef) {
        const r = await toolGetOrderDetail(user, detected.orderRef);
        toolsUsed.push("get_order_detail");
        if (!r.ok) {
          parts.push(r.denied || "تعذّر جلب الطلب.");
          break;
        }
        const o = r.data as {
          id: string; orderNumber: string; status: string; total: string;
          paymentMethod: string; paymentStatus: string; storeName: string | null;
          deadlineAt: string | null;
          items: Array<{ title: string; qty: number; price: string }>;
        };
        toolFacts.push(`الطلب ${o.orderNumber} بحالة ${o.status} وإجمالي ${o.total}`);
        parts.push(
          `تفاصيل طلبك ${o.orderNumber}:\n• الحالة: ${orderStatusAr(o.status)}\n• الإجمالي: ${fmtMoney(o.total)} (${paymentMethodAr(o.paymentMethod)} — ${o.paymentStatus === "paid" ? "مدفوع ✅" : o.paymentStatus === "refunded" ? "مسترد ↩️" : o.paymentStatus === "pending" ? "بانتظار تأكيد الدفع ⏳" : "غير مدفوع"})\n• المتجر: ${o.storeName || "—"}\n• الأصناف: ${o.items.map((i) => `${i.title} ×${i.qty}`).join("، ") || "—"}`
        );
        // Conflict detection: overdue?
        if (o.deadlineAt && new Date(o.deadlineAt).getTime() < Date.now() && !["COMPLETED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_MERCHANT"].includes(o.status)) {
          parts.push(`⏰ تنبيه: تجاوز هذا الطلب مهلة التنفيذ. إذا كان التأخير من التاجر دون عذر، يحق لك التصعيد وستُطبق الغرامة النظامية (5%).`);
          riskFlags.push({ code: "OVERDUE_ORDER", labelAr: `طلب متجاوز للمهلة ${o.orderNumber}`, severity: "high" });
        }
        actions.push({ type: "orders", label: "فتح الطلب 📦", href: orderLink(o.id) });
      } else {
        const r = await toolGetOrders(user, 5);
        toolsUsed.push("get_orders");
        if (!r.ok) {
          parts.push(r.denied || "تعذّر جلب الطلبات.");
          if (!user.id) actions.push({ type: "link", label: "تسجيل الدخول", href: "/auth/login" });
          break;
        }
        const list = (r.data?.orders as Array<{ id: string; orderNumber: string; status: string; total: string }>) || [];
        if (!list.length) {
          parts.push(`لا توجد طلبات في سجلك حتى الآن. تصفّح السوق وابدأ أول طلبٍ لك! 🛍️`);
          actions.push({ type: "link", label: "تصفح السوق", href: "/" });
        } else {
          toolFacts.push(`${list.length} طلبات أخيرة`);
          const lines = list.map((o) => `• ${o.orderNumber} — ${orderStatusAr(o.status)} — ${fmtMoney(o.total)}`);
          parts.push(
            user.role === "merchant"
              ? `أحدث الطلبات الواردة إلى متجرك:\n${lines.join("\n")}\n\nأخبرني برقم الطلب (مثل ${list[0].orderNumber}) لعرض تفاصيله.`
              : `أحدث طلباتك:\n${lines.join("\n")}\n\nأخبرني برقم الطلب لعرض تفاصيله وحالته بدقة.`
          );
          actions.push({ type: "orders", label: "كل الطلبات 📦", href: "/orders" });
        }
      }
      break;
    }
    case "order_list": {
      const r = await toolGetOrders(user, 5);
      toolsUsed.push("get_orders");
      if (!r.ok) {
        parts.push(r.denied || "تعذّر جلب الطلبات.");
        break;
      }
      const list = (r.data?.orders as Array<{ orderNumber: string; status: string; total: string }>) || [];
      if (!list.length) parts.push(`لا توجد طلبات مسجلة بعد.`);
      else {
        toolFacts.push(`${list.length} طلبات`);
        parts.push(`طلباتك الأخيرة:\n${list.map((o) => `• ${o.orderNumber} — ${orderStatusAr(o.status)} — ${fmtMoney(o.total)}`).join("\n")}`);
      }
      actions.push({ type: "orders", label: "فتح صفحة الطلبات 📦", href: "/orders" });
      break;
    }
    case "negotiation_status": {
      const r = await toolGetNegotiations(user);
      toolsUsed.push("get_negotiations");
      if (!r.ok) {
        parts.push(r.denied || "تعذّر جلب المفاوضات.");
        break;
      }
      const items = (r.data?.items as Array<{ status: string; originalPrice: string; buyerOffer: string | null; merchantCounterOffer: string | null; agreedPrice: string | null }>) || [];
      if (!items.length) {
        parts.push(
          `لا توجد مفاوضات نشطة حالياً. للتفاوض: افتح صفحة منتجٍ قابلٍ للتفاوض واضغط «قدّم عرض سعر» — وسيصل عرضك إلى التاجر فوراً.`
        );
      } else {
        toolFacts.push(`${items.length} مفاوضات`);
        const lines = items.map((n, i) => {
          const cur = n.agreedPrice ? `اتُّفق على ${fmtMoney(n.agreedPrice)} ✅` : n.merchantCounterOffer ? `عرض مضاد ${fmtMoney(n.merchantCounterOffer)}` : n.buyerOffer ? `عرضك ${fmtMoney(n.buyerOffer)} بانتظار الرد` : `السعر الأصلي ${fmtMoney(n.originalPrice)}`;
          return `${i + 1}. ${cur} (الحالة: ${n.status})`;
        });
        parts.push(`مفاوضاتك الأخيرة:\n${lines.join("\n")}\n\nنصيحة: العروض الجادة القريبة من السعر الأصلي تُقبل عادةً بسرعة. 🤝`);
      }
      actions.push({ type: "orders", label: "متابعة من الطلبات 📦", href: "/orders" });
      break;
    }
    case "shipping_info": {
      parts.push(
        `سياسة الشحن في متجرك 🇸🇩:\n• داخل الولاية نفسها: التنفيذ خلال 3 أيام.\n• بين الولايات: حتى 14 يوماً.\n• تُحتسب المهلة بتوقيت الخادم من لحظة قبول التاجر، مع فترة سماح 48 ساعة ثم غرامة 5% على المقصّر.\n\nأخبرني برقم طلبك لأخبرك بحالته وموعد تسليمه المتوقع بدقة.`
      );
      actions.push({ type: "orders", label: "تتبع طلباتي 📦", href: "/orders" });
      break;
    }
    case "commission_info": {
      if (!user.id) {
        parts.push(`عمولة المنصة 5% على قيمة المنتجات فقط (دون التوصيل)، وتُستحق عند إتمام الطلب فقط. سجّل الدخول كتاجر لعرض مستحقاتك الخاصة.`);
        actions.push({ type: "link", label: "تسجيل الدخول", href: "/auth/login" });
        break;
      }
      if (user.role === "merchant") {
        const r = await toolGetWallet(user);
        toolsUsed.push("get_wallet");
        const due = (r.data as { commissionDue?: string } | undefined)?.commissionDue || "0.00";
        toolFacts.push(`عمولة مستحقة ${due}`);
        parts.push(
          `نظام العمولة للتجار:\n• النسبة 5% من قيمة المنتجات فقط، وتُستقطع تلقائياً عند إتمام الطلب (تستلم 95%).\n• في البيع النقدي تُخصم من محفظتك، وإن لم تكفِ تُسجَّل كمستحقٍ يُسوَّى أولاً من أي إيداعٍ قادم.\n• مستحقاتك الحالية: ${fmtMoney(due)} ${Number(due) > 0 ? "⚠️" : "✅ (لا يوجد)"}`
        );
        actions.push({ type: "wallet", label: "محفظة التاجر 💰", href: "/wallet" });
      } else if (isAdminRole(user.role)) {
        parts.push(`تُحصَّل العمولة (5%) تلقائياً عند انتقال الطلب إلى «مكتمل»، وتُسوَّى المستحقات أولاً من أي إيداعٍ للتاجر. يمكنك مراجعة التفاصيل من اللوحة المالية.`);
        actions.push({ type: "link", label: "اللوحة المالية", href: "/admin?section=finance" });
      } else {
        parts.push(`عزيزي الزبون، العمولة (5%) تُستقطع من التاجر فقط عند إتمام الطلب — أنت تدفع سعر المنتج والتوصيل فقط دون أي رسومٍ إضافية. ✅`);
      }
      break;
    }
    case "withdrawal_status": {
      if (user.role !== "merchant") {
        parts.push(
          user.id
            ? `طلبات السحب خاصة بالتجار. كزبون يمكنك شحن محفظتك والدفع منها واستلام المستردات عليها.`
            : `سجّل الدخول أولاً لعرض بيانات السحب.`
        );
        break;
      }
      const [w, kyc] = await Promise.all([toolGetWithdrawals(user), toolGetMerchantKyc(user)]);
      toolsUsed.push("get_withdrawals", "get_kyc");
      const verified = (kyc.data as { verified?: boolean } | undefined)?.verified;
      const items = (w.data?.items as Array<{ amount: string; status: string; method: string }>) || [];
      toolFacts.push(`توثيق التاجر: ${verified ? "موثق" : "غير موثق"}، ${items.length} طلبات سحب`);
      if (!verified) {
        parts.push(`🔒 حسابك التجاري غير موثّق بعد، لذا فإن طلبات السحب مقيّدة. أكمل التوثيق (KYC) من لوحة التاجر لتفعيل السحب إلى حسابك البنكي.`);
        actions.push({ type: "link", label: "لوحة التاجر 🏪", href: "/merchant" });
      } else if (!items.length) {
        parts.push(`حسابك موثّق ✅ ولا توجد طلبات سحبٍ سابقة. يمكنك طلب سحب أرباحك المتاحة من المحفظة، وستعتمدها الإدارة سريعاً.`);
        actions.push({ type: "wallet", label: "طلب سحب من المحفظة 💰", href: "/wallet" });
      } else {
        parts.push(
          `طلبات السحب الأخيرة:\n${items.map((x, i) => `${i + 1}. ${fmtMoney(x.amount)} عبر ${x.method} — ${x.status === "paid" ? "تم الصرف ✅" : x.status === "rejected" ? "مرفوض ❌" : "قيد المراجعة ⏳"}`).join("\n")}`
        );
        actions.push({ type: "wallet", label: "المحفظة 💰", href: "/wallet" });
      }
      break;
    }
    case "payment_help": {
      parts.push(
        `الدفع في متجرك آمن ومتعدد القنوات:\n• الدفع النقدي عند الاستلام 💵\n• الدفع من رصيد المحفظة 💰\n• البوابات الإلكترونية: بنكك، أوكاش، فوري، EBS 📱 (مع تأكيدٍ تلقائي عبر Webhook وقيدٍ مزدوج)\n\nإذا فشلت عملية دفعٍ إلكترونية أخبرني برقم المرجع (PAY-...) لأتحقق من حالتها فوراً.`
      );
      actions.push({ type: "wallet", label: "شحن المحفظة 💰", href: "/wallet" });
      break;
    }
    case "receipt_help": {
      parts.push(
        `كل طلبٍ مكتمل يحصل على إيصالٍ رسمي برقمٍ تسلسلي (MTJ-...) ورمز QR للتحقق. يمكنك فتح صفحة «التحقق من إيصال» وإدخال الرقم أو مسح الرمز للتأكد من صحة أي إيصال. 🧾`
      );
      actions.push({ type: "link", label: "التحقق من إيصال 🔍", href: "/verify" });
      break;
    }
    case "cancellation_help": {
      parts.push(
        `سياسة الإلغاء والاسترداد:\n• قبل قبول التاجر: إلغاء مجاني مع استردادٍ كاملٍ تلقائي.\n• بعد القبول: لا يوجد إلغاء صامت — يوثّق التاجر سبب التعذّر، ويحق لك فتح نزاعٍ يُراجَع بشرياً.\n\nأخبرني برقم الطلب لأساعدك في الخطوة المناسبة.`
      );
      actions.push({ type: "orders", label: "طلباتي 📦", href: "/orders" });
      break;
    }
    case "inspection_help": {
      parts.push(
        user.role === "merchant"
          ? `فحص المنتجات ذكي وعادل: عند النشر يُفحص المنتج (صور + نص + مستندات دون فيديو) وتكون النتيجة: قبول 🟢 أو طلب معلومات 🟡 أو مراجعة بشرية 🟠 أو رفضٌ مبرر 🔴. حسّن الصور والوصف حسب الملاحظات وأعد التقديم.`
          : `جميع المنتجات المعروضة تمر بفحصٍ ذكي للجودة والأصالة قبل النشر، فتسوّق بثقة. 🛡️`
      );
      if (user.role === "merchant") actions.push({ type: "link", label: "منتجاتي 🏷️", href: "/merchant?tab=products" });
      break;
    }
    case "friday_help": {
      parts.push(
        `وضع الجمعة 🕌 يتوقف فيه البيع تلقائياً وقت صلاة الجمعة حسب توقيت منطقتك (مع آياتٍ وأذكار وعدّاد تسبيح)، بينما تبقى طلباتك ومحفظتك وسجلاتك آمنةً وتعمل في الخلفية، ويعود كل شيءٍ تلقائياً بعد الصلاة.`
      );
      break;
    }
    case "dispute_help": {
      parts.push(
        `أنا آسف لسماع ذلك، وسأساعدك على حلٍّ عادل. 🤝\n• إن كان الخلاف حول طلبٍ قائم: افتح الطلب واستخدم زر «فتح نزاع» مع شرحٍ موجز، وسيُراجَع بشرياً.\n• تجنّب أي اتفاقٍ خارج المنصة لأنه يفقدك الحماية.\n• أخبرني برقم الطلب لأراجع حالته ومساره معك الآن.`
      );
      actions.push({ type: "orders", label: "فتح الطلبات 📦", href: "/orders" });
      break;
    }
    case "fee_policy": {
      parts.push(
        `أهم سياسات متجرك:\n• العمولة 5% على المنتجات فقط عند الإتمام.\n• المهلة: 3 أيام داخل الولاية، 14 يوماً بين الولايات + سماح 48 ساعة.\n• غرامة التأخير غير المبرر 5% على المقصّر.\n• الإلغاء مجاني قبل قبول التاجر.`
      );
      actions.push({ type: "link", label: "الشروط الكاملة 📜", href: "/terms" });
      break;
    }
    case "product_search": {
      const r = await toolSearchProducts(detected.productQuery || message);
      toolsUsed.push("search_products");
      if (!r.ok) {
        parts.push(r.denied || "أخبرني باسم المنتج وسأساعدك في إيجاده. 🔍");
        break;
      }
      const items = (r.data?.items as Array<{ id: string; title: string; price: string; negotiable: boolean; status: string }>) || [];
      if (!items.length) {
        parts.push(`لم أجد منتجاً مطابقاً حالياً. جرّب كلمةً أخرى أو تصفّح التصنيفات — أو أخبرني بالميزانية والاستخدام وسأقترح عليك.`);
        actions.push({ type: "link", label: "تصفح السوق 🛍️", href: "/" });
      } else {
        toolFacts.push(`${items.length} نتائج بحث`);
        parts.push(
          `وجدتُ لك هذه الخيارات:\n${items.map((p, i) => `${i + 1}. ${p.title} — ${fmtMoney(p.price)}${p.negotiable ? " (قابل للتفاوض 🤝)" : ""}`).join("\n")}`
        );
        actions.push({ type: "link", label: `عرض: ${items[0].title.slice(0, 30)}`, href: `/products/${items[0].id}` });
      }
      break;
    }
    case "fraud_report":
    case "contact_human": {
      // Handled by escalation flow below; add context line here
      if (detected.intent === "fraud_report") {
        parts.push(`شكراً لإبلاغك — سلامة مجتمع متجرك أولوية قصوى. 🛡️`);
      }
      break;
    }
    default: {
      parts.push(
        `عذراً، لم أفهم طلبك تماماً. يمكنني مساعدتك في: رصيد المحفظة 💰، حالة الطلبات 📦، التفاوض 🤝، الشحن 🚚، العمولة للتجار 📊، الدفع الإلكتروني 📱، أو التواصل مع الدعم البشري.`
      );
      actions.push({ type: "link", label: "مركز المساعدة 📖", href: "/help" });
      break;
    }
  }

  // ---- Escalation handling ----
  let ticketRequest: AssistantTurnResult["ticketRequest"] = null;
  if (escalation.shouldEscalate) {
    if (escalation.autoCreate) {
      const category = categorizeFromIntent(detected.intent);
      ticketRequest = {
        category,
        severity: escalation.severity as "normal" | "high" | "critical",
        subject: `تصعيد من ${who}: ${category}`,
        orderId: null, // resolved by API if orderRef tool succeeded
        reason: escalation.reason,
      };
      parts.push(
        escalation.severity === "critical"
          ? `🚨 أنشأتُ لك تذكرة دعمٍ عاجلة، وسيتدخل فريق الدعم البشري فوراً. ستجد رقم التذكرة أدناه لمتابعتها — وأنا ${who} باقٍ معك لأي مساعدةٍ أخرى.`
          : `📩 أنشأتُ لك تذكرة دعمٍ وحوّلت ملخصاً ذكياً إلى فريقنا البشري — سيتواصل معك قريباً. ستجد رقم التذكرة أدناه.`
      );
    } else {
      parts.push(
        `يبدو أن مشكلتك تحتاج إلى تدخلٍ بشري — هل ترغب أن أنشئ لك تذكرة دعمٍ وأحوّلها إلى فريقنا مع ملخصٍ ذكي؟ (اكتب: نعم، أريد موظفاً)`
      );
    }
    await pushChannelsAction();
  }

  // Always offer official channels on upset/angry or unknown
  if ((detected.sentiment === "angry" || detected.sentiment === "upset" || detected.intent === "unknown") && !escalation.shouldEscalate) {
    if (!actions.some((a) => a.type === "channels")) {
      await pushChannelsAction();
      if (actions.some((a) => a.type === "channels")) {
        parts.push(`ويمكنك أيضاً التواصل المباشر مع فريق الدعم عبر القنوات الرسمية أدناه. 💬`);
      }
    }
  }

  // Identity footer guard: never impersonate admin
  const reply = parts.filter(Boolean).join("\n\n");

  return {
    reply: reply || "كيف أساعدك؟",
    intent: detected.intent,
    confidence: detected.confidence,
    sentiment: detected.sentiment,
    dialectHits: detected.dialectHits,
    toolsUsed: [...new Set(toolsUsed)],
    toolFacts,
    riskFlags,
    escalation,
    actions,
    ticketRequest,
  };
}

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

export { maskPhone };
