"use strict";
export class InteractionRegistry {
  buttonHandlers = /* @__PURE__ */ new Map();
  modalHandlers = /* @__PURE__ */ new Map();
  selectHandlers = /* @__PURE__ */ new Map();
  registerButton(prefix, handler) {
    this.buttonHandlers.set(prefix, handler);
  }
  registerModal(prefix, handler) {
    this.modalHandlers.set(prefix, handler);
  }
  registerSelect(prefix, handler) {
    this.selectHandlers.set(prefix, handler);
  }
  async handleButton(interaction) {
    for (const [prefix, handler] of this.buttonHandlers.entries()) {
      if (interaction.customId.startsWith(prefix)) {
        await handler(interaction);
        return true;
      }
    }
    return false;
  }
  async handleModal(interaction) {
    for (const [prefix, handler] of this.modalHandlers.entries()) {
      if (interaction.customId.startsWith(prefix)) {
        await handler(interaction);
        return true;
      }
    }
    return false;
  }
  async handleSelectMenu(interaction) {
    for (const [prefix, handler] of this.selectHandlers.entries()) {
      if (interaction.customId.startsWith(prefix)) {
        await handler(interaction);
        return true;
      }
    }
    return false;
  }
}
export const interactionRegistry = new InteractionRegistry();
