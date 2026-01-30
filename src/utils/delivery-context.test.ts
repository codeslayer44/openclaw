import { describe, expect, it } from "vitest";

import {
  deliveryContextKey,
  deliveryContextFromSession,
  mergeDeliveryContext,
  normalizeDeliveryContext,
  normalizeSessionDeliveryFields,
} from "./delivery-context.js";

describe("delivery context helpers", () => {
  it("normalizes channel/to/accountId and drops empty contexts", () => {
    expect(
      normalizeDeliveryContext({
        channel: " whatsapp ",
        to: " +1555 ",
        accountId: " acct-1 ",
      }),
    ).toEqual({
      channel: "whatsapp",
      to: "+1555",
      accountId: "acct-1",
    });

    expect(normalizeDeliveryContext({ channel: "  " })).toBeUndefined();
  });

  it("normalizes senderId and senderName", () => {
    expect(
      normalizeDeliveryContext({
        channel: "telegram",
        to: "123",
        senderId: " 7338489031 ",
        senderName: " Ryan ",
      }),
    ).toEqual({
      channel: "telegram",
      to: "123",
      senderId: "7338489031",
      senderName: "Ryan",
    });

    // Empty senderId/senderName are dropped
    expect(
      normalizeDeliveryContext({
        channel: "telegram",
        to: "123",
        senderId: "  ",
        senderName: "",
      }),
    ).toEqual({
      channel: "telegram",
      to: "123",
    });

    // senderId alone keeps context alive
    expect(normalizeDeliveryContext({ senderId: "7338489031" })).toEqual({
      senderId: "7338489031",
    });
  });

  it("merges primary values over fallback", () => {
    const merged = mergeDeliveryContext(
      { channel: "whatsapp", to: "channel:abc" },
      { channel: "slack", to: "channel:def", accountId: "acct" },
    );

    expect(merged).toEqual({
      channel: "whatsapp",
      to: "channel:abc",
      accountId: "acct",
    });
  });

  it("merges senderId and senderName with fallback", () => {
    const merged = mergeDeliveryContext(
      { channel: "telegram", to: "123", senderId: "7338489031" },
      { channel: "slack", to: "456", senderId: "U01ABC", senderName: "Fallback Name" },
    );

    expect(merged).toEqual({
      channel: "telegram",
      to: "123",
      senderId: "7338489031",
      senderName: "Fallback Name",
    });
  });

  it("builds stable keys only when channel and to are present", () => {
    expect(deliveryContextKey({ channel: "whatsapp", to: "+1555" })).toBe("whatsapp|+1555||");
    expect(deliveryContextKey({ channel: "whatsapp" })).toBeUndefined();
    expect(deliveryContextKey({ channel: "whatsapp", to: "+1555", accountId: "acct-1" })).toBe(
      "whatsapp|+1555|acct-1|",
    );
    expect(deliveryContextKey({ channel: "slack", to: "channel:C1", threadId: "123.456" })).toBe(
      "slack|channel:C1||123.456",
    );
  });

  it("derives delivery context from a session entry", () => {
    expect(
      deliveryContextFromSession({
        channel: "webchat",
        lastChannel: " whatsapp ",
        lastTo: " +1777 ",
        lastAccountId: " acct-9 ",
      }),
    ).toEqual({
      channel: "whatsapp",
      to: "+1777",
      accountId: "acct-9",
    });

    expect(
      deliveryContextFromSession({
        channel: "telegram",
        lastTo: " 123 ",
        lastThreadId: " 999 ",
      }),
    ).toEqual({
      channel: "telegram",
      to: "123",
      accountId: undefined,
      threadId: "999",
    });
  });

  it("normalizes delivery fields and mirrors them on session entries", () => {
    const normalized = normalizeSessionDeliveryFields({
      deliveryContext: {
        channel: " Slack ",
        to: " channel:1 ",
        accountId: " acct-2 ",
        threadId: " 444 ",
      },
      lastChannel: " whatsapp ",
      lastTo: " +1555 ",
    });

    expect(normalized.deliveryContext).toEqual({
      channel: "whatsapp",
      to: "+1555",
      accountId: "acct-2",
      threadId: "444",
    });
    expect(normalized.lastChannel).toBe("whatsapp");
    expect(normalized.lastTo).toBe("+1555");
    expect(normalized.lastAccountId).toBe("acct-2");
    expect(normalized.lastThreadId).toBe("444");
  });

  it("mirrors senderId and senderName on session entries", () => {
    const normalized = normalizeSessionDeliveryFields({
      deliveryContext: {
        channel: "telegram",
        to: "123",
        senderId: "7338489031",
        senderName: "Ryan",
      },
    });

    expect(normalized.deliveryContext).toEqual({
      channel: "telegram",
      to: "123",
      senderId: "7338489031",
      senderName: "Ryan",
    });
    expect(normalized.lastSenderId).toBe("7338489031");
    expect(normalized.lastSenderName).toBe("Ryan");
  });

  it("merges lastSenderId/lastSenderName from session source", () => {
    const normalized = normalizeSessionDeliveryFields({
      lastChannel: "telegram",
      lastTo: "123",
      lastSenderId: "7338489031",
      lastSenderName: "Ryan",
    });

    expect(normalized.deliveryContext).toEqual({
      channel: "telegram",
      to: "123",
      senderId: "7338489031",
      senderName: "Ryan",
    });
    expect(normalized.lastSenderId).toBe("7338489031");
    expect(normalized.lastSenderName).toBe("Ryan");
  });
});
