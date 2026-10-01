"use client";
import { useEffect, useState } from "react";
import { ContactChannelPill } from "./ContactChannelButtons";
import type { PublicChannel } from "@/lib/contact-channels";

/**
 * One-click contact with the other party of an order (privacy-guarded by backend).
 * Shows store channels + counterpart user channels (order_only).
 */
export function OrderContactButtons({
  orderId,
  targetUserId,
  storeId,
  title,
}: {
  orderId: string;
  targetUserId?: string | null;
  storeId?: string | null;
  title?: string;
}) {
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // تأجيل setState الأولي خارج جسم الـ effect المتزامن
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    const jobs: Array<Promise<void>> = [];
    const acc: PublicChannel[] = [];
    if (storeId) {
      jobs.push(
        fetch(`/api/contact-channels?storeId=${storeId}`)
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.channels)) acc.push(...d.channels);
            if (d.storeName) setStoreName(d.storeName);
          })
          .catch(() => {})
      );
    }
    if (targetUserId) {
      jobs.push(
        fetch(`/api/contact-channels?targetUserId=${targetUserId}&orderId=${orderId}`)
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.channels)) acc.push(...d.channels);
          })
          .catch(() => {})
      );
    }
    Promise.all(jobs).finally(() => {
      if (cancelled) return;
      setChannels(acc);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, targetUserId, storeId]);

  if (loading) {
    return (
      <div className="flex gap-2">
        <div className="h-9 w-28 animate-pulse rounded-full bg-slate-100" />
        <div className="h-9 w-28 animate-pulse rounded-full bg-slate-100" />
      </div>
    );
  }
  if (channels.length === 0) return null;

  return (
    <div>
      {title && <p className="mb-1.5 text-xs font-black text-slate-500">{title}</p>}
      <div className="flex flex-wrap gap-2">
        {channels.map((c) => (
          <ContactChannelPill key={c.id} ch={c} orderId={orderId} />
        ))}
      </div>
      {storeName && <p className="mt-1 text-[11px] text-slate-400">🏪 {storeName}</p>}
    </div>
  );
}

/** Store contact buttons (public storefront) */
export function StoreContactButtons({ storeId }: { storeId: string }) {
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/contact-channels?storeId=${storeId}`)
      .then((r) => r.json())
      .then((d) => setChannels(d.channels || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [storeId]);

  if (!loaded || channels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {channels.map((c) => (
        <ContactChannelPill key={c.id} ch={c} />
      ))}
    </div>
  );
}
