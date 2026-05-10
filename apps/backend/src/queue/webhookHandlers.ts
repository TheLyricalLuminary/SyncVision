// Business logic handlers for Stripe webhook events.
// Used by webhookWorker (BullMQ primary path) and reconciliationWorker.
//
// RULES:
// 1. Every handler is idempotent — safe to call multiple times per event.id
// 2. All plan mutations use updateMany with guard condition (replay-safe).
// 3. Every handler writes to StripeEventLedger and StripeAuditLog.
// 4. stripeCustomerId is persisted to User on first successful checkout.

import prisma from "../lib/prisma";
import { auditLog } from "../lib/auditLog";
import { planIdToPlanLevel } from "../contracts/pricing.contract";

// ── Ledger helpers ─────────────────────────────────────────────────────────────

async function markLedgerProcessed(eventId: string, type: string, source: string): Promise<void> {
  await prisma.stripeEventLedger.upsert({
    where:  { id: eventId },
    update: { processed: true, processedAt: new Date(), processingError: null },
    create: { id: eventId, type, source, processed: true, processedAt: new Date() },
  });
}

async function markLedgerError(eventId: string, type: string, source: string, error: string): Promise<void> {
  await prisma.stripeEventLedger.upsert({
    where:  { id: eventId },
    update: { processingError: error },
    create: { id: eventId, type, source, processed: false, processingError: error },
  });
}

// ── checkout.session.completed ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleCheckout(data: any, eventId: string, source = "webhook"): Promise<void> {
  const session = data.object;

  // Branch on session mode: one-time credit purchases vs subscription upgrades.
  if (session?.mode === "payment") {
    await handleCreditPurchase(data, eventId, source);
    return;
  }

  await handleSubscriptionCheckout(data, eventId, source);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCheckout(data: any, eventId: string, source: string): Promise<void> {
  const session          = data.object;
  const userId           = session?.metadata?.userId as string | undefined;
  const planId           = session?.metadata?.planId as string | undefined;
  const stripeCustomerId = session?.customer as string | undefined;

  if (!userId) {
    console.warn(`[webhook] checkout.session.completed missing userId in metadata event=${eventId}`);
    await auditLog("LEDGER_PROCESSING_ERROR", "ERROR", {
      eventId, source, reason: "missing_userId_in_metadata", tag: "[STRIPE_RECON]",
    }, eventId);
    await markLedgerError(eventId, "checkout.session.completed", source, "missing userId in metadata");
    return;
  }

  if (stripeCustomerId) {
    await prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data:  { stripeCustomerId },
    });
  }

  const targetLevel = (planId ? planIdToPlanLevel(planId) : null) ?? "SUPERVISOR";

  const result = await prisma.user.updateMany({
    where: { id: userId, planLevel: "COMPOSER" },
    data:  { planLevel: targetLevel },
  });

  const upgraded = result.count > 0;
  const action   = upgraded ? "ENTITLEMENT_UPGRADED" : "ENTITLEMENT_NOOP";

  await auditLog(action, upgraded ? "OK" : "NOOP", {
    eventId, userId, planId, targetLevel, source,
    stripeCustomerId: stripeCustomerId ?? null,
    tag: "[STRIPE_REPAIR]",
  }, eventId);

  if (upgraded) {
    console.log(`[webhook] user=${userId} → ${targetLevel} (plan=${planId}) event=${eventId}`);
  } else {
    console.log(`[webhook] user=${userId} already upgraded — no-op event=${eventId}`);
  }

  await markLedgerProcessed(eventId, "checkout.session.completed", source);
  await auditLog("LEDGER_MARKED_PROCESSED", "OK", { eventId, type: "checkout.session.completed", source }, eventId);
}

// ── handleCreditPurchase — one-time payment top-up ────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreditPurchase(data: any, eventId: string, source: string): Promise<void> {
  const session          = data.object;
  const userId           = session?.metadata?.userId as string | undefined;
  const packId           = session?.metadata?.packId as string | undefined;
  const creditsStr       = session?.metadata?.credits as string | undefined;
  const stripeCustomerId = session?.customer as string | undefined;
  const credits          = creditsStr ? parseInt(creditsStr, 10) : 0;

  if (!userId || !packId || !credits) {
    console.warn(`[webhook] credit purchase missing metadata userId=${userId} packId=${packId} credits=${credits} event=${eventId}`);
    await auditLog("LEDGER_PROCESSING_ERROR", "ERROR", {
      eventId, source, reason: "missing_credit_metadata", userId, packId, credits, tag: "[STRIPE_RECON]",
    }, eventId);
    await markLedgerError(eventId, "checkout.session.completed", source, "missing credit metadata");
    return;
  }

  if (stripeCustomerId) {
    await prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data:  { stripeCustomerId },
    });
  }

  // Idempotent: CreditTransaction has stripeEventId as @unique — second insert
  // for the same event fails at DB level, so the increment only happens once.
  await prisma.$transaction(async (tx) => {
    await tx.creditTransaction.create({
      data: { userId, packId, credits, stripeEventId: eventId },
    });
    await tx.user.update({
      where: { id: userId },
      data:  { creditBalance: { increment: credits } },
    });
  });

  console.log(`[webhook] user=${userId} +${credits} credits (pack=${packId}) event=${eventId}`);

  await markLedgerProcessed(eventId, "checkout.session.completed", source);
  await auditLog("CREDITS_TOPPED_UP", "OK", {
    eventId, userId, packId, credits, source,
    stripeCustomerId: stripeCustomerId ?? null,
    tag: "[STRIPE_REPAIR]",
  }, eventId);
}

// ── invoice.paid ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleInvoicePaid(data: any, eventId: string, source = "webhook"): Promise<void> {
  const invoice          = data.object;
  const stripeCustomerId = invoice?.customer as string | undefined;
  console.log(`[webhook] invoice.paid customer=${stripeCustomerId} event=${eventId}`);

  await markLedgerProcessed(eventId, "invoice.paid", source);
  await auditLog("LEDGER_MARKED_PROCESSED", "OK", { eventId, type: "invoice.paid", source, stripeCustomerId }, eventId);
}

// ── customer.subscription.deleted ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleSubscriptionDeleted(data: any, eventId: string, source = "webhook"): Promise<void> {
  const sub              = data.object;
  const stripeCustomerId = sub?.customer as string | undefined;

  if (stripeCustomerId) {
    const user = await prisma.user.findFirst({ where: { stripeCustomerId } });
    if (user) {
      const result = await prisma.user.updateMany({
        where: { id: user.id, planLevel: { not: "COMPOSER" } },
        data:  { planLevel: "COMPOSER" },
      });
      const downgraded = result.count > 0;
      await auditLog(downgraded ? "ENTITLEMENT_DOWNGRADED" : "ENTITLEMENT_NOOP", downgraded ? "OK" : "NOOP", {
        eventId, userId: user.id, stripeCustomerId, source, tag: "[STRIPE_REPAIR]",
      }, eventId);
      if (downgraded) console.log(`[webhook] user=${user.id} → COMPOSER (subscription cancelled) event=${eventId}`);
    }
  }

  await markLedgerProcessed(eventId, "customer.subscription.deleted", source);
  await auditLog("LEDGER_MARKED_PROCESSED", "OK", { eventId, type: "customer.subscription.deleted", source }, eventId);
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dispatchEvent(type: string, data: any, eventId = "unknown", source = "webhook"): Promise<void> {
  // Write-first idempotency: durable INSERT before any business logic.
  // The StripeEvent table has eventId as PK — a duplicate insert throws P2002.
  // If the event was already processed (Redis TTL expired, Render redeployed,
  // queue replayed), we find the record here and return before re-executing
  // any plan mutation. This is the authoritative gate; Redis is a fast-path
  // cache on top, not the source of truth.
  try {
    await prisma.stripeEvent.create({ data: { eventId, type } });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") {
      console.log(`[webhook] duplicate event=${eventId} type=${type} source=${source} — skipped`);
      await auditLog("WEBHOOK_DUPLICATE", "SKIPPED", { eventId, type, layer: "db", source, tag: "[STRIPE_DUPLICATE]" }, eventId);
      return;
    }
    throw e;
  }

  switch (type) {
    case "checkout.session.completed":
      await handleCheckout(data, eventId, source);
      break;
    case "invoice.paid":
      await handleInvoicePaid(data, eventId, source);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(data, eventId, source);
      break;
    default:
      console.log(`[webhook] unhandled type=${type} event=${eventId}`);
      await markLedgerProcessed(eventId, type, source);
  }
}
