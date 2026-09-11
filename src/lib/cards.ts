import cardData from '../../data/cards.json';
import type { SpendCategory } from './categories';

/**
 * Card earning-rate data and the scoring engine.
 *
 * data/cards.json is hand-curated from public issuer information. Its field names
 * mirror the Rewards Credit Card API schema so the file can be swapped for live API
 * data later without touching this module.
 */

export type SpendBonus = {
  spendBonusCategoryName: string;
  earnMultiplier: number;
  isSpendLimit?: boolean;
  spendLimit?: number;
  spendLimitResetPeriod?: string;
  spendBonusDesc?: string;
};

export type Card = {
  cardKey: string;
  cardName: string;
  cardIssuer: string;
  cardNetwork: string;
  annualFee: number;
  earnCurrency: string;
  baseSpendAmount: number;
  spendBonusCategory?: SpendBonus[];
  signupBonusDesc?: string;
};

export const ALL_CARDS: Card[] = (cardData as { cards: Card[] }).cards;

export function cardByKey(key: string): Card | undefined {
  return ALL_CARDS.find((c) => c.cardKey === key);
}

export type Recommendation = {
  card: Card;
  multiplier: number;
  /** True when the multiplier comes from a category bonus rather than the base rate. */
  isBonus: boolean;
  /** Issuer's own wording for the bonus, when there is one. */
  reason: string;
  /** Set when the bonus has an annual spend cap the user should know about. */
  capNote: string | null;
};

/**
 * Scores one card against a category.
 *
 * A null category means we couldn't identify the merchant, so every card earns its
 * base rate. We deliberately do not guess.
 */
function scoreCard(card: Card, category: SpendCategory | null): Recommendation {
  const bonus = category
    ? card.spendBonusCategory?.find((b) => b.spendBonusCategoryName === category)
    : undefined;

  if (!bonus) {
    return {
      card,
      multiplier: card.baseSpendAmount,
      isBonus: false,
      reason: `${card.baseSpendAmount}x base rate on everything`,
      capNote: null,
    };
  }

  const capNote =
    bonus.isSpendLimit && bonus.spendLimit
      ? `capped at $${bonus.spendLimit.toLocaleString()}/${bonus.spendLimitResetPeriod ?? 'year'}`
      : null;

  return {
    card,
    multiplier: bonus.earnMultiplier,
    isBonus: true,
    reason: bonus.spendBonusDesc ?? `${bonus.earnMultiplier}x on ${category}`,
    capNote,
  };
}

/**
 * Ranks a wallet against a spend category, best first.
 *
 * Ties break toward the lower annual fee — if two cards earn the same rate here, the
 * one costing less to hold is the better card to reach for.
 */
export function rankWallet(
  walletKeys: string[],
  category: SpendCategory | null,
): Recommendation[] {
  return walletKeys
    .map(cardByKey)
    .filter((c): c is Card => c !== undefined)
    .map((card) => scoreCard(card, category))
    .sort((a, b) => {
      if (b.multiplier !== a.multiplier) return b.multiplier - a.multiplier;
      return a.card.annualFee - b.card.annualFee;
    });
}

/** Sensible starting wallet so the app is useful before the picker screen exists. */
export const DEFAULT_WALLET = [
  'amex-gold',
  'chase-sapphire-preferred',
  'chase-freedom-unlimited',
  'citi-double-cash',
  'wells-fargo-active-cash',
];
