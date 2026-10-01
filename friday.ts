/** Friday Mode: activates 5 min before Friday 1st Adhan (~12:00 Khartoum) until prayer ends (~14:00). */
export interface FridayStatus {
  isFriday: boolean;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  reason: string;
}

export function getFridayStatus(now: Date = new Date(), timezone = "Africa/Khartoum"): FridayStatus {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const weekday = get("weekday");
    const hour = parseInt(get("hour"), 10);
    const minute = parseInt(get("minute"), 10);
    const isFriday = weekday === "Fri";
    if (!isFriday) {
      return { isFriday: false, isActive: false, startsAt: null, endsAt: null, reason: "not_friday" };
    }
    const mins = hour * 60 + minute;
    // 11:55 -> 14:00
    const active = mins >= 11 * 60 + 55 && mins < 14 * 60;
    return {
      isFriday: true,
      isActive: active,
      startsAt: null,
      endsAt: null,
      reason: active ? "jumuah_prayer" : mins < 11 * 60 + 55 ? "before_prayer" : "after_prayer",
    };
  } catch {
    const isFriday = now.getDay() === 5;
    const mins = now.getHours() * 60 + now.getMinutes();
    return {
      isFriday,
      isActive: isFriday && mins >= 11 * 60 + 55 && mins < 14 * 60,
      startsAt: null,
      endsAt: null,
      reason: "fallback",
    };
  }
}

export const JUMUAH_VERSES = {
  ar: "يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا نُودِيَ لِلصَّلَاةِ مِن يَوْمِ الْجُمُعَةِ فَاسْعَوْا إِلَىٰ ذِكْرِ اللَّهِ وَذَرُوا الْبَيْعَ ۚ ذَٰلِكُمْ خَيْرٌ لَّكُمْ إِن كُنتُمْ تَعْلَمُونَ (9) فَإِذَا قُضِيَتِ الصَّلَاةُ فَانتَشِرُوا فِي الْأَرْضِ وَابْتَغُوا مِن فَضْلِ اللَّهِ وَاذْكُرُوا اللَّهَ كَثِيرًا لَّعَلَّكُمْ تُفْلِحُونَ (10)",
  source: "سورة الجمعة — الآيات 9-10",
};

export const KAHF_EXCERPT = {
  title: "سورة الكهف — مقتطف",
  ar: "الْحَمْدُ لِلَّهِ الَّذِي أَنزَلَ عَلَىٰ عَبْدِهِ الْكِتَابَ وَلَمْ يَجْعَل لَّهُ عِوَجًا (1) قَيِّمًا لِّيُنذِرَ بَأْسًا شَدِيدًا مِّن لَّدُنْهُ وَيُبَشِّرَ الْمُؤْمِنِينَ الَّذِينَ يَعْمَلُونَ الصَّالِحَاتِ أَنَّ لَهُمْ أَجْرًا حَسَنًا (2) مَّاكِثِينَ فِيهِ أَبَدًا (3) ... (اقرأ السورة كاملة من مصحفك، وتقبل الله منا ومنكم)",
};

export const TASBEEH_LIST = ["سبحان الله", "الحمد لله", "الله أكبر", "لا إله إلا الله", "أستغفر الله", "اللهم صلِّ على محمد"];
