"use strict";
import { economyService } from "./economyService";
import { t } from "../i18n";
export class EconomyGamblingService {
  slotEmojis = ["\u{1F34E}", "\u{1F34A}", "\u{1F347}", "\u{1F352}", "\u{1F48E}", "7\uFE0F\u20E3"];
  rouletteRed = [
    1,
    3,
    5,
    7,
    9,
    12,
    14,
    16,
    18,
    19,
    21,
    23,
    25,
    27,
    30,
    32,
    34,
    36
  ];
  // Dice game - roll against dealer
  async playDice(userId, guildId, bet) {
    const canAfford = await economyService.canAffordBet(userId, guildId, bet);
    if (!canAfford.canAfford) {
      throw new Error(t("commands.economy.errors.insufficientFunds"));
    }
    const playerRoll = Math.floor(Math.random() * 6) + 1;
    const dealerRoll = Math.floor(Math.random() * 6) + 1;
    const tie = playerRoll === dealerRoll;
    const won = playerRoll > dealerRoll;
    const multiplier = tie ? 1 : won ? 2 : 0;
    const details = {
      playerRoll,
      dealerRoll,
      won,
      tie
    };
    return await economyService.processGamble(
      userId,
      guildId,
      "dice",
      bet,
      won || tie,
      multiplier,
      details
    );
  }
  // Coinflip game
  async playCoinflip(userId, guildId, bet, choice) {
    const canAfford = await economyService.canAffordBet(userId, guildId, bet);
    if (!canAfford.canAfford) {
      throw new Error(t("commands.economy.errors.insufficientFunds"));
    }
    const result = Math.random() < 0.5 ? "heads" : "tails";
    const won = result === choice;
    const multiplier = won ? 2 : 0;
    const details = {
      choice,
      result,
      won
    };
    return await economyService.processGamble(
      userId,
      guildId,
      "coinflip",
      bet,
      won,
      multiplier,
      details
    );
  }
  // Slots game
  async playSlots(userId, guildId, bet) {
    const canAfford = await economyService.canAffordBet(userId, guildId, bet);
    if (!canAfford.canAfford) {
      throw new Error(t("commands.economy.errors.insufficientFunds"));
    }
    const reels = [
      this.slotEmojis[Math.floor(Math.random() * this.slotEmojis.length)],
      this.slotEmojis[Math.floor(Math.random() * this.slotEmojis.length)],
      this.slotEmojis[Math.floor(Math.random() * this.slotEmojis.length)]
    ];
    let won = false;
    let winType;
    let multiplier = 0;
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      won = true;
      if (reels[0] === "7\uFE0F\u20E3") {
        winType = "jackpot";
        multiplier = 10;
      } else if (reels[0] === "\u{1F48E}") {
        winType = "triple";
        multiplier = 5;
      } else {
        winType = "triple";
        multiplier = 3;
      }
    } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
      won = true;
      winType = "double";
      multiplier = 1.5;
    }
    const details = {
      reels,
      won,
      winType,
      multiplier
    };
    return await economyService.processGamble(
      userId,
      guildId,
      "slots",
      bet,
      won,
      multiplier,
      details
    );
  }
  // Blackjack game
  async playBlackjack(userId, guildId, bet) {
    const canAfford = await economyService.canAffordBet(userId, guildId, bet);
    if (!canAfford.canAfford) {
      throw new Error(t("commands.economy.errors.insufficientFunds"));
    }
    const deck = this.createDeck();
    this.shuffleDeck(deck);
    const playerCard1 = deck.pop();
    const playerCard2 = deck.pop();
    const dealerCard1 = deck.pop();
    const dealerCard2 = deck.pop();
    if (!playerCard1 || !playerCard2 || !dealerCard1 || !dealerCard2) {
      throw new Error(t("common.error"));
    }
    const playerHand = [playerCard1, playerCard2];
    const dealerHand = [dealerCard1, dealerCard2];
    while (this.calculateHandValue(dealerHand).value < 17) {
      const card = deck.pop();
      if (!card) break;
      dealerHand.push(card);
    }
    while (this.calculateHandValue(playerHand).value < 17 && !this.calculateHandValue(playerHand).bust) {
      const handValue = this.calculateHandValue(playerHand);
      const dealerUpCard = dealerHand[0].value === 1 ? 11 : dealerHand[0].value;
      if (handValue.value < 12) {
        const card = deck.pop();
        if (!card) break;
        playerHand.push(card);
      } else if (handValue.value < 17 && dealerUpCard >= 7) {
        const card = deck.pop();
        if (!card) break;
        playerHand.push(card);
      } else {
        break;
      }
    }
    const playerHandResult = this.calculateHandValue(playerHand);
    const dealerHandResult = this.calculateHandValue(dealerHand);
    let won = false;
    let push = false;
    let multiplier = 0;
    if (playerHandResult.bust) {
      won = false;
    } else if (dealerHandResult.bust) {
      won = true;
      multiplier = 2;
    } else if (playerHandResult.blackjack && !dealerHandResult.blackjack) {
      won = true;
      multiplier = 2.5;
    } else if (!playerHandResult.blackjack && dealerHandResult.blackjack) {
      won = false;
    } else if (playerHandResult.value === dealerHandResult.value) {
      push = true;
      multiplier = 1;
    } else if (playerHandResult.value > dealerHandResult.value) {
      won = true;
      multiplier = 2;
    }
    const details = {
      playerHand: { ...playerHandResult, cards: playerHand },
      dealerHand: { ...dealerHandResult, cards: dealerHand },
      won,
      push,
      blackjack: playerHandResult.blackjack,
      multiplier
    };
    return await economyService.processGamble(
      userId,
      guildId,
      "blackjack",
      bet,
      won || push,
      multiplier,
      details
    );
  }
  // Roulette game
  async playRoulette(userId, guildId, bet, betType, betValue) {
    const canAfford = await economyService.canAffordBet(userId, guildId, bet);
    if (!canAfford.canAfford) {
      throw new Error(t("commands.economy.errors.insufficientFunds"));
    }
    const number = Math.floor(Math.random() * 37);
    const color = number === 0 ? "green" : this.rouletteRed.includes(number) ? "red" : "black";
    let won = false;
    let multiplier = 0;
    switch (betType) {
      case "number":
        won = number === Number(betValue);
        multiplier = won ? 36 : 0;
        break;
      case "color":
        won = color === betValue;
        multiplier = won ? 2 : 0;
        break;
      case "even":
        won = number !== 0 && number % 2 === 0;
        multiplier = won ? 2 : 0;
        break;
      case "odd":
        won = number !== 0 && number % 2 === 1;
        multiplier = won ? 2 : 0;
        break;
      case "low":
        won = number >= 1 && number <= 18;
        multiplier = won ? 2 : 0;
        break;
      case "high":
        won = number >= 19 && number <= 36;
        multiplier = won ? 2 : 0;
        break;
      case "dozen": {
        const dozen = Number(betValue);
        if (dozen === 1) won = number >= 1 && number <= 12;
        else if (dozen === 2) won = number >= 13 && number <= 24;
        else if (dozen === 3) won = number >= 25 && number <= 36;
        multiplier = won ? 3 : 0;
        break;
      }
    }
    const details = {
      number,
      color,
      won,
      betType,
      multiplier
    };
    return await economyService.processGamble(
      userId,
      guildId,
      "roulette",
      bet,
      won,
      multiplier,
      details
    );
  }
  // Helper methods for blackjack
  createDeck() {
    const suits = ["\u2660", "\u2665", "\u2666", "\u2663"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        let value = parseInt(rank);
        if (isNaN(value)) {
          value = rank === "A" ? 1 : 10;
        }
        deck.push({ suit, rank, value });
      }
    }
    return deck;
  }
  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    for (const card of hand) {
      value += card.value;
      if (card.rank === "A") aces++;
    }
    while (aces > 0 && value + 10 <= 21) {
      value += 10;
      aces--;
    }
    const soft = aces > 0;
    const bust = value > 21;
    const blackjack = hand.length === 2 && value === 21;
    return { value, soft, blackjack, bust };
  }
}
export const economyGamblingService = new EconomyGamblingService();
