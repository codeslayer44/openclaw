import { normalizeAccountId } from "./account-id.js";
import { normalizeMessageChannel } from "./message-channel.js";

export type DeliveryContext = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  senderId?: string;
  senderName?: string;
};

export type DeliveryContextSessionSource = {
  channel?: string;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  lastSenderId?: string;
  lastSenderName?: string;
  deliveryContext?: DeliveryContext;
};

export function normalizeDeliveryContext(context?: DeliveryContext): DeliveryContext | undefined {
  if (!context) return undefined;
  const channel =
    typeof context.channel === "string"
      ? (normalizeMessageChannel(context.channel) ?? context.channel.trim())
      : undefined;
  const to = typeof context.to === "string" ? context.to.trim() : undefined;
  const accountId = normalizeAccountId(context.accountId);
  const threadId =
    typeof context.threadId === "number" && Number.isFinite(context.threadId)
      ? Math.trunc(context.threadId)
      : typeof context.threadId === "string"
        ? context.threadId.trim()
        : undefined;
  const normalizedThreadId =
    typeof threadId === "string" ? (threadId ? threadId : undefined) : threadId;
  const senderId = typeof context.senderId === "string" ? context.senderId.trim() : undefined;
  const senderName = typeof context.senderName === "string" ? context.senderName.trim() : undefined;
  if (!channel && !to && !accountId && normalizedThreadId == null && !senderId && !senderName)
    return undefined;
  const normalized: DeliveryContext = {
    channel: channel || undefined,
    to: to || undefined,
    accountId,
  };
  if (normalizedThreadId != null) normalized.threadId = normalizedThreadId;
  if (senderId) normalized.senderId = senderId;
  if (senderName) normalized.senderName = senderName;
  return normalized;
}

export function normalizeSessionDeliveryFields(source?: DeliveryContextSessionSource): {
  deliveryContext?: DeliveryContext;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  lastSenderId?: string;
  lastSenderName?: string;
} {
  if (!source) {
    return {
      deliveryContext: undefined,
      lastChannel: undefined,
      lastTo: undefined,
      lastAccountId: undefined,
      lastThreadId: undefined,
      lastSenderId: undefined,
      lastSenderName: undefined,
    };
  }

  const merged = mergeDeliveryContext(
    normalizeDeliveryContext({
      channel: source.lastChannel ?? source.channel,
      to: source.lastTo,
      accountId: source.lastAccountId,
      threadId: source.lastThreadId,
      senderId: source.lastSenderId,
      senderName: source.lastSenderName,
    }),
    normalizeDeliveryContext(source.deliveryContext),
  );

  if (!merged) {
    return {
      deliveryContext: undefined,
      lastChannel: undefined,
      lastTo: undefined,
      lastAccountId: undefined,
      lastThreadId: undefined,
      lastSenderId: undefined,
      lastSenderName: undefined,
    };
  }

  return {
    deliveryContext: merged,
    lastChannel: merged.channel,
    lastTo: merged.to,
    lastAccountId: merged.accountId,
    lastThreadId: merged.threadId,
    lastSenderId: merged.senderId,
    lastSenderName: merged.senderName,
  };
}

export function deliveryContextFromSession(
  entry?: DeliveryContextSessionSource,
): DeliveryContext | undefined {
  if (!entry) return undefined;
  return normalizeSessionDeliveryFields(entry).deliveryContext;
}

export function mergeDeliveryContext(
  primary?: DeliveryContext,
  fallback?: DeliveryContext,
): DeliveryContext | undefined {
  const normalizedPrimary = normalizeDeliveryContext(primary);
  const normalizedFallback = normalizeDeliveryContext(fallback);
  if (!normalizedPrimary && !normalizedFallback) return undefined;
  return normalizeDeliveryContext({
    channel: normalizedPrimary?.channel ?? normalizedFallback?.channel,
    to: normalizedPrimary?.to ?? normalizedFallback?.to,
    accountId: normalizedPrimary?.accountId ?? normalizedFallback?.accountId,
    threadId: normalizedPrimary?.threadId ?? normalizedFallback?.threadId,
    senderId: normalizedPrimary?.senderId ?? normalizedFallback?.senderId,
    senderName: normalizedPrimary?.senderName ?? normalizedFallback?.senderName,
  });
}

export function deliveryContextKey(context?: DeliveryContext): string | undefined {
  const normalized = normalizeDeliveryContext(context);
  if (!normalized?.channel || !normalized?.to) return undefined;
  const threadId =
    normalized.threadId != null && normalized.threadId !== "" ? String(normalized.threadId) : "";
  return `${normalized.channel}|${normalized.to}|${normalized.accountId ?? ""}|${threadId}`;
}
