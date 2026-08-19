"use strict";
export * from "./command";
export var ModActionType = /* @__PURE__ */ ((ModActionType2) => {
  ModActionType2["Warn"] = "warn";
  ModActionType2["Mute"] = "mute";
  ModActionType2["Kick"] = "kick";
  ModActionType2["Ban"] = "ban";
  ModActionType2["Unmute"] = "unmute";
  ModActionType2["Unban"] = "unban";
  ModActionType2["Timeout"] = "timeout";
  ModActionType2["Lock"] = "lock";
  ModActionType2["Unlock"] = "unlock";
  ModActionType2["Slowmode"] = "slowmode";
  ModActionType2["Purge"] = "purge";
  return ModActionType2;
})(ModActionType || {});
export var TicketStatus = /* @__PURE__ */ ((TicketStatus2) => {
  TicketStatus2["Open"] = "open";
  TicketStatus2["Claimed"] = "claimed";
  TicketStatus2["Closed"] = "closed";
  TicketStatus2["Locked"] = "locked";
  TicketStatus2["Frozen"] = "frozen";
  return TicketStatus2;
})(TicketStatus || {});
