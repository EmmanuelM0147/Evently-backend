// Paystack local card/bank fee, in kobo: 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000
export const paystackFee = (kobo) => Math.min(Math.ceil(kobo * 0.015) + (kobo >= 250000 ? 10000 : 0), 200000);

// Smallest charge that leaves the couple with the full gift after Paystack takes its fee
export const chargeToCoverFee = (giftKobo) => {
  let charge = Math.ceil(giftKobo / 0.985);
  if (charge >= 250000) charge = Math.ceil((giftKobo + 10000) / 0.985);
  if (paystackFee(charge) >= 200000) charge = giftKobo + 200000;
  charge = Math.ceil(charge / 100) * 100;
  while (charge - paystackFee(charge) < giftKobo) charge += 100;
  return charge;
};

export const MIN_GIFT_NAIRA = 100;
export const MAX_GIFT_NAIRA = 5000000;
