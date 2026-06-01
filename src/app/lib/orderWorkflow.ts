/**
 * orderWorkflow.ts
 *
 * Frontend mirror of backend/models/Order.js's state machine. Keeping these
 * rules in one place — and having the UI use the same rules the API enforces —
 * means the admin button you see is the action the server will actually
 * accept. No more "click stage 4, get a 400, read the error" UX.
 *
 * If the backend rules change, this file changes too. The route layer is still
 * the source of truth — this is the UI mirror.
 */

export type OrderStatus =
  | 'pending'
  | 'approved'
  | 'in_production'
  | 'ready'
  | 'out_for_delivery'
  | 'for_pickup'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'refunded'
  | 'shipped'   // legacy
  | 'delivered'; // legacy

export type DeliveryMethod = 'delivery' | 'pickup';

export interface OrderForWorkflow {
  status: OrderStatus;
  deliveryMethod?: DeliveryMethod | string;
  paymentStatus?: string;
  paymentMethod?: string;
  assignedTo?: any;
  qcStatus?: string;
  blockerStatus?: string;
}

/** The single forward step from each status (delivery-method aware). */
function forwardOf(order: OrderForWorkflow): OrderStatus | null {
  const isPickup = order.deliveryMethod === 'pickup';
  switch (order.status) {
    case 'pending':          return 'approved';
    case 'approved':         return 'in_production';
    case 'in_production':    return 'ready';
    case 'ready':            return isPickup ? 'for_pickup' : 'out_for_delivery';
    case 'out_for_delivery':
    case 'for_pickup':       return 'completed';
    default:                 return null; // terminal or legacy
  }
}

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  approved:         'Approve order',
  in_production:    'Start production',
  ready:            'Mark Ready',
  out_for_delivery: 'Send out for delivery',
  for_pickup:       'Mark ready for pickup',
};

/** Human-friendly action label for the next-step button. */
function actionLabelFor(from: OrderStatus, to: OrderStatus, isPickup: boolean): string {
  if (to === 'completed') return isPickup ? 'Mark picked up & completed' : 'Mark delivered & completed';
  return ACTION_LABELS[to] || `Move to ${String(to).replace(/_/g, ' ')}`;
}

export interface PreCondition {
  /** True when the condition is already satisfied. */
  met: boolean;
  /** What's missing (shown to the admin when met=false). */
  message: string;
  /** Optional in-app URL where the admin can resolve the gap. */
  fixHref?: string;
  /** Optional short label shown next to the requirement chip. */
  hint?: string;
}

/**
 * Pre-conditions for the given (from → to) transition. Mirrors the rules
 * in backend `checkTransitionPrecondition`. Returning conditions instead of
 * just true/false lets the UI tell the admin exactly what to do.
 */
function preconditionsFor(order: OrderForWorkflow, to: OrderStatus): PreCondition[] {
  const from = order.status;
  const conds: PreCondition[] = [];

  // pending → approved : payment must be settled (or COD)
  if (from === 'pending' && to === 'approved') {
    const paid = order.paymentStatus === 'paid' || order.paymentMethod === 'cod';
    conds.push({
      met: paid,
      message: paid ? 'Payment confirmed' : 'Payment not yet settled — confirm it before approving',
      hint: paid ? undefined : 'Payment',
    });
  }

  // approved → in_production : a staff assignee is required (admin override possible)
  if (from === 'approved' && to === 'in_production') {
    const assigned = !!order.assignedTo;
    conds.push({
      met: assigned,
      message: assigned ? 'Staff assigned' : 'Assign a production staff member first',
      fixHref: '/admin/production',
      hint: assigned ? undefined : 'Staff',
    });
  }

  // in_production → ready : QC must have passed
  if (from === 'in_production' && to === 'ready') {
    const qcOk = order.qcStatus === 'approved';
    conds.push({
      met: qcOk,
      message: qcOk ? 'QC approved' : 'Quality check must be approved (use the QC review panel on the Production page)',
      fixHref: '/admin/production',
      hint: qcOk ? undefined : 'QC',
    });
  }

  // ready → out_for_delivery / for_pickup : delivery method must match AND
  // QC must have passed. The backend (Order.js checkTransitionPrecondition)
  // enforces both — keep the mirror in sync so the button doesn't go
  // green and then 400.
  if (from === 'ready' && (to === 'out_for_delivery' || to === 'for_pickup')) {
    const wantMethod: DeliveryMethod = to === 'for_pickup' ? 'pickup' : 'delivery';
    const otherLabel = to === 'for_pickup' ? 'Send out for delivery' : 'Mark ready for pickup';
    const methodOk = order.deliveryMethod === wantMethod;
    conds.push({
      met: methodOk,
      message: methodOk
        ? `${wantMethod[0].toUpperCase() + wantMethod.slice(1)} order`
        : `Wrong delivery method — use "${otherLabel}" instead`,
    });
    const qcOk = order.qcStatus === 'approved';
    conds.push({
      met: qcOk,
      message: qcOk ? 'QC approved' : 'Quality check must be approved before shipping',
      fixHref: qcOk ? undefined : '/admin/production',
      hint: qcOk ? undefined : 'QC',
    });
  }

  // Blocker check — applies to everything except cancel/reject
  if (order.blockerStatus === 'active') {
    conds.push({
      met: false,
      message: 'Order has an active blocker — clear it before advancing',
      hint: 'Blocker',
    });
  }

  return conds;
}

/**
 * The single next step the admin should take on this order, plus
 * whatever pre-conditions are blocking it. Returns null for terminal /
 * legacy statuses where no forward step exists.
 */
export function getNextStep(order: OrderForWorkflow): {
  to: OrderStatus;
  label: string;
  conditions: PreCondition[];
  ready: boolean;
} | null {
  const to = forwardOf(order);
  if (!to) return null;
  const conditions = preconditionsFor(order, to);
  const ready = conditions.every((c) => c.met);
  return {
    to,
    label: actionLabelFor(order.status, to, order.deliveryMethod === 'pickup'),
    conditions,
    ready,
  };
}

/**
 * Can the admin cancel right now? Admin can cancel from any non-terminal
 * status (cancellation always requires a reason — that's enforced in the
 * cancel handler itself, not here).
 */
export function canCancel(order: OrderForWorkflow): boolean {
  return !TERMINAL.has(order.status);
}

/** Reject is only available while the order is still pending. */
export function canReject(order: OrderForWorkflow): boolean {
  return order.status === 'pending';
}

const TERMINAL = new Set<OrderStatus>(['completed', 'cancelled', 'rejected', 'refunded']);

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * One-liner explaining why a terminal order can't be advanced — used at
 * the top of the drawer when the pipeline strip is hidden.
 */
export function terminalReason(status: OrderStatus): string {
  switch (status) {
    case 'completed': return 'This order is complete. Refunds are still available from the actions menu.';
    case 'cancelled': return 'This order was cancelled. To restart, the customer needs to place a new order.';
    case 'rejected':  return 'This order was rejected. The customer was notified with the reason.';
    case 'refunded':  return 'This order was refunded.';
    default:          return '';
  }
}
