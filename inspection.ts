import { cmp } from "./money";

export interface InspectionInput {
  titleAr: string;
  descriptionAr?: string | null;
  price: string;
  originalPrice?: string | null;
  condition: string;
  specs: Record<string, unknown>;
  imageCount: number;
  imageUrls: string[];
  categorySlug?: string | null;
  minImages: number;
  requiresDeed: boolean;
  deedUrl?: string | null;
  expiryDate?: Date | null;
  allergens?: string | null;
  existingImageHashes?: string[];
}

export interface InspectionCheck {
  name: string;
  nameAr: string;
  passed: boolean;
  weight: number;
  detailAr: string;
}

export interface InspectionResult {
  decision: "APPROVED" | "NEEDS_MORE_INFO" | "NEEDS_REVIEW" | "REJECTED";
  confidence: number;
  checks: InspectionCheck[];
  explanationAr: string;
  explanationEn: string;
}

function isStockLike(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("shutterstock") ||
    u.includes("istock") ||
    u.includes("unsplash") ||
    u.includes("pexels") ||
    u.includes("placeholder") ||
    u.includes("stock")
  );
}

export function runInspection(input: InspectionInput): InspectionResult {
  const checks: InspectionCheck[] = [];
  let earned = 0;
  let total = 0;
  const push = (c: InspectionCheck) => {
    checks.push(c);
    total += c.weight;
    if (c.passed) earned += c.weight;
  };

  // 1. Image count rule (dynamic by category)
  push({
    name: "image_count",
    nameAr: "عدد الصور",
    passed: input.imageCount >= input.minImages,
    weight: 25,
    detailAr:
      input.imageCount >= input.minImages
        ? `عدد الصور (${input.imageCount}) يفي بالحد الأدنى (${input.minImages})`
        : `مطلوب ${input.minImages} صور على الأقل لهذه الفئة، المتوفر ${input.imageCount}`,
  });

  // 2. Title & description quality
  const titleOk = input.titleAr.trim().length >= 6;
  const descLen = (input.descriptionAr || "").trim().length;
  const descOk = descLen >= 20;
  push({
    name: "text_quality",
    nameAr: "جودة النص",
    passed: titleOk && descOk,
    weight: 15,
    detailAr: !titleOk
      ? "عنوان المنتج قصير جداً، أضف عنواناً واضحاً"
      : !descOk
        ? "الوصف قصير، أضف تفاصيل أكثر (20 حرفاً على الأقل)"
        : "العنوان والوصف واضحان",
  });

  // 3. Price sanity (manipulation guard — no auto penalty, affects confidence)
  let priceOk = true;
  let priceDetail = "السعر ضمن النطاق الطبيعي";
  try {
    if (input.originalPrice && cmp(input.originalPrice, "0") > 0) {
      const ratio = Number(input.originalPrice) / Math.max(Number(input.price), 1);
      if (ratio >= 5) {
        priceOk = false;
        priceDetail = "فرق كبير بين السعر الأصلي والحالي، يتطلب مراجعة (احتمال تلاعب بالعمولة)";
      } else if (Number(input.price) <= 0) {
        priceOk = false;
        priceDetail = "السعر يجب أن يكون أكبر من صفر";
      }
    }
  } catch {}
  push({ name: "price_sanity", nameAr: "سلامة السعر", passed: priceOk, weight: 15, detailAr: priceDetail });

  // 4. Category-specific profile
  const slug = (input.categorySlug || "").toLowerCase();
  if (slug.includes("phone") || slug.includes("electronic") || slug.includes("elect") || slug.includes("car") || slug.includes("vehicle")) {
    const specs = input.specs || {};
    const hasModel = Boolean(specs["model"] || specs["brand"]);
    const hasStorage = slug.includes("phone") ? Boolean(specs["storage"] || specs["ram"]) : true;
    const hasSerial = Boolean(specs["imei"] || specs["serial"] || specs["serialNumber"]);
    const usedNeedsDetail = input.condition !== "new" ? descLen >= 60 : true;
    const passed = hasModel && hasStorage && usedNeedsDetail;
    push({
      name: "electronics_profile",
      nameAr: "فحص الإلكترونيات",
      passed,
      weight: 20,
      detailAr: !hasModel
        ? "أضف الموديل والماركة في المواصفات"
        : !hasStorage
          ? "أضف سعة التخزين والذاكرة للهواتف"
          : !usedNeedsDetail
            ? "المنتج المستعمل يحتاج وصفاً مفصلاً لحالته (60 حرفاً على الأقل)"
            : hasSerial
              ? "مواصفات الإلكترونيات مكتملة مع الرقم التسلسلي"
              : "المواصفات جيدة (يُفضل إضافة الرقم التسلسلي/IMEI)",
    });
  } else if (slug.includes("food") || slug.includes("grocery")) {
    const hasExpiry = Boolean(input.expiryDate);
    push({
      name: "food_profile",
      nameAr: "فحص الأغذية",
      passed: hasExpiry,
      weight: 20,
      detailAr: hasExpiry
        ? `تاريخ الانتهاء موثق${input.allergens ? " مع الإفصاح عن مسببات الحساسية" : ""}`
        : "منتجات الأغذية تتطلب توثيق تاريخ الانتهاء",
    });
  } else if (slug.includes("real") || slug.includes("estate") || slug.includes("land") || input.requiresDeed) {
    const hasDeed = Boolean(input.deedUrl);
    push({
      name: "realestate_profile",
      nameAr: "فحص العقارات",
      passed: hasDeed && descLen >= 60,
      weight: 20,
      detailAr: !hasDeed
        ? "العقارات والأراضي تتطلب رفع صك الملكية/شهادة البحث"
        : descLen < 60
          ? "أضف وصفاً مفصلاً للعقار (الموقع، المساحة، المميزات)"
          : "مستندات الملكية والوصف مكتملة",
    });
  } else {
    // Generic apparel/furniture/books: multi-angle for apparel/shoes/furniture
    const needsMulti = slug.includes("fashion") || slug.includes("cloth") || slug.includes("shoe") || slug.includes("furniture");
    push({
      name: "generic_profile",
      nameAr: "الفحص العام",
      passed: needsMulti ? input.imageCount >= 2 : input.imageCount >= 1,
      weight: 20,
      detailAr: needsMulti
        ? input.imageCount >= 2
          ? "صور متعددة الزوايا متوفرة"
          : "الملابس والأحذية والأثاث تتطلب صورتين من زاويتين مختلفتين على الأقل"
        : "الفحص العام سليم",
    });
  }

  // 5. Image authenticity (stock/AI/reused — single indicator never auto-rejects)
  const stockHits = input.imageUrls.filter(isStockLike).length;
  const reusedHits = 0; // computed by backend hash check; placeholder
  const authenticityPassed = stockHits === 0;
  push({
    name: "authenticity",
    nameAr: "أصالة الصور",
    passed: authenticityPassed,
    weight: 15,
    detailAr:
      stockHits > 0
        ? `تم رصد ${stockHits} صورة تبدو كصور مخزنية/جاهزة — يُفضل صور حقيقية من متجرك`
        : reusedHits > 0
          ? "تم رصد صور مكررة مستخدمة في متاجر أخرى"
          : "الصور تبدو أصلية",
  });

  // 6. Condition consistency
  const validConditions = ["new", "used", "refurbished"];
  push({
    name: "condition",
    nameAr: "اتساق الحالة",
    passed: validConditions.includes(input.condition),
    weight: 10,
    detailAr: validConditions.includes(input.condition)
      ? `الحالة المعلنة: ${input.condition === "new" ? "جديد" : input.condition === "used" ? "مستعمل" : "مُجدد"}`
      : "حالة المنتج غير محددة بوضوح",
  });

  const confidence = total === 0 ? 0 : Math.round((earned / total) * 100);

  // Decision thresholds (respectful, no single-indicator penalty):
  let decision: InspectionResult["decision"];
  let explanationAr: string;
  let explanationEn: string;
  const failedCritical = checks.find((c) => c.name === "image_count" && !c.passed);
  const failedDeed = checks.find((c) => c.name === "realestate_profile" && !c.passed);

  if (confidence >= 85) {
    decision = "APPROVED";
    explanationAr = "🟢 تم قبول منتجك بنجاح! الصور والنصوص مستوفية للمعايير، وهو الآن ظاهر للزبائن. شكراً لالتزامك بالجودة.";
    explanationEn = "Product approved and visible to buyers.";
  } else if (failedCritical || failedDeed) {
    decision = "NEEDS_MORE_INFO";
    explanationAr = `🟡 منتجك يحتاج إلى معلومات إضافية قبل النشر: ${failedCritical ? failedCritical.detailAr : ""} ${failedDeed ? failedDeed.detailAr : ""} — أكمل النواقص وسيتم مراجعته تلقائياً.`;
    explanationEn = "More info needed before publishing.";
  } else if (confidence >= 55) {
    decision = "NEEDS_REVIEW";
    explanationAr = "🟠 منتجك قيد المراجعة البشرية من فريق متجرك. عادة نرد خلال ساعات. لا حاجة لأي إجراء منك الآن.";
    explanationEn = "Pending human review.";
  } else {
    decision = "REJECTED";
    explanationAr = "🔴 تعذر قبول هذا المنتج حالياً لعدم استيفاء معايير الجودة والأصالة. راجع الملاحظات التفصيلية، حسّن الصور والوصف، وأعد التقديم — نحن هنا لمساعدتك على النجاح.";
    explanationEn = "Product rejected. Please improve and resubmit.";
  }

  return { decision, confidence, checks, explanationAr, explanationEn };
}

/** Commerce Integrity risk score (0-100) — never auto-destroys, escalates to HUMAN_REVIEW. */
export function computeRiskScore(opts: {
  priceChanges: Array<{ oldPrice: string; newPrice: string; at: string }>;
  imageReuseCount: number;
  stockImageCount: number;
  negotiationAbuseCount?: number;
  disputeCount?: number;
}): { score: number; level: "LOW" | "MEDIUM" | "HIGH"; reasonsAr: string[] } {
  let score = 0;
  const reasonsAr: string[] = [];
  for (const ch of opts.priceChanges || []) {
    try {
      const o = Number(ch.oldPrice);
      const n = Number(ch.newPrice);
      if (o > 0 && n > 0) {
        const drop = (o - n) / o;
        if (drop >= 0.9) {
          score += 45;
          reasonsAr.push(`انخفاض سعري حاد (${o} → ${n}) قد يشير لمحاولة تجاوز العمولة`);
        } else if (drop >= 0.5) {
          score += 15;
          reasonsAr.push(`انخفاض سعري ملحوظ (${o} → ${n})`);
        }
      }
    } catch {}
  }
  if (opts.imageReuseCount > 0) {
    score += Math.min(opts.imageReuseCount * 10, 30);
    reasonsAr.push(`صور مكررة في ${opts.imageReuseCount} متاجر أخرى`);
  }
  if (opts.stockImageCount > 0) {
    score += Math.min(opts.stockImageCount * 8, 24);
    reasonsAr.push(`${opts.stockImageCount} صور مخزنية مشتبهة`);
  }
  if ((opts.negotiationAbuseCount || 0) > 3) {
    score += 10;
    reasonsAr.push("نشاط تفاوضي غير معتاد");
  }
  if ((opts.disputeCount || 0) > 0) {
    score += Math.min((opts.disputeCount || 0) * 12, 36);
    reasonsAr.push(`${opts.disputeCount} نزاعات سابقة`);
  }
  score = Math.min(score, 100);
  const level = score >= 70 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";
  if (reasonsAr.length === 0) reasonsAr.push("لا توجد مؤشرات خطر — نشاط طبيعي");
  return { score, level, reasonsAr };
}
