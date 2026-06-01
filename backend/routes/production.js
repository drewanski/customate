import express from 'express';
import mongoose from 'mongoose';
import Order, { PRODUCTION_STAGES } from '../models/Order.js';
import OrderAuditLog from '../models/OrderAuditLog.js';
import User from '../models/User.js';
import ProductionLog from '../models/ProductionLog.js';
import ProductionCapacity from '../models/ProductionCapacity.js';
import { authMiddleware, adminMiddleware, requireRoles, requireManager, requireProductionStaff } from '../middleware/auth.js';
import { consumeReservedForOrder } from '../services/inventory.js';
import { notifyCustomerOfStatus } from './orders.js';
import { postSystemMessage } from './chat.js';

/**
 * Loophole guard: any code path that changes order.status from a production
 * route MUST also write an OrderAuditLog row + fire the customer notification.
 * Otherwise the customer-facing timeline silently misses the transition and
 * the customer's bell stays empty. Use this helper everywhere.
 */
async function syncCustomerTimelineForStatus({ order, fromStatus, toStatus, actor, note, reason }) {
  if (fromStatus === toStatus) return;
  try {
    await OrderAuditLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'status_changed',
      from: fromStatus,
      to: toStatus,
      reason: reason || '',
      note: note || '',
      performedBy: actor.performedBy,
      performedByName: actor.performedByName,
      performedByRole: actor.performedByRole,
    });
  } catch { /* non-fatal */ }
  await notifyCustomerOfStatus(order, toStatus, reason);
}

const router = express.Router();

// Production routes are split across THREE access tiers:
//   * requireProductionStaff: read-only queue access + status nudges
//   * requireManager:         scheduling, approvals, rejections, capacity
//   * adminMiddleware:        none here (kept for finance/account routes)
// authMiddleware always runs first so req.user is populated.
router.use(authMiddleware);

/**
 * Strip customer PII from a populated order document based on the caller's
 * role. Production staff have no business reason to see contact info or
 * pricing. The admin (= business owner / Production Manager) sees the
 * full record.
 *
 * Mutates a plain object (call .toObject() first if you have a Mongoose doc).
 */
function sanitizeOrderForRole(order, role) {
  if (!order || typeof order !== 'object') return order;
  if (role === 'admin') return order; // owner — sees everything
  if (role === 'production_staff') {
    // Staff see ONLY: design preview, item specs, status. Everything else
    // is redacted — including pricing, payment, and customer contact.
    delete order.customer;
    delete order.customerEmail;
    delete order.customerPhone;
    delete order.shippingAddress;
    delete order.recipientName;
    delete order.totalPrice;
    delete order.subtotal;
    delete order.discountAmount;
    delete order.rushFeeAmount;
    delete order.requiredPayment;
    delete order.paidAmount;
    delete order.refundedAmount;
    delete order.paymentMethod;
    delete order.paymentStatus;
    delete order.paymentDetails;
    delete order.couponCode;
    delete order.notes; // customer-facing notes
    // Keep these — staff DO need to see what to make:
    //   items (with customization + preview + sku + qty)
    //   status, productionDate, productionDueDate, productionStage
    //   productionPriority, productionNotes (internal)
    //   assignedTo, urgencyTier
    return order;
  }
  return order;
}

// Helper used by every route handler: apply the role filter before
// res.json() so we don't have to thread `req` into every helper.
function jsonForRole(req, res, payload) {
  if (Array.isArray(payload)) {
    return res.json(payload.map((o) => sanitizeOrderForRole({ ...o }, req.user.role)));
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.orders)) {
    return res.json({
      ...payload,
      orders: payload.orders.map((o) => sanitizeOrderForRole({ ...o }, req.user.role)),
    });
  }
  return res.json(sanitizeOrderForRole({ ...payload }, req.user.role));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Snapshot the current user for the audit log so the entry stays readable
 * even after the user is renamed or deleted.
 */
async function actorSnapshot(req) {
  let name = '';
  try {
    const u = await User.findById(req.user.userId).select('name');
    if (u) name = u.name;
  } catch {
    /* non-fatal */
  }
  return {
    performedBy: req.user.userId,
    performedByName: name,
    performedByRole: req.user.role || '',
  };
}

/**
 * Populate one or many orders with denormalized customer + assignee data.
 * Avoids the populate() schema-mismatch issue the legacy code worked around
 * with awkward Promise.all/find loops.
 */
async function attachUsers(orders) {
  const list = Array.isArray(orders) ? orders : [orders];
  const customerIds = new Set();
  const assigneeIds = new Set();
  for (const o of list) {
    if (o.customer) customerIds.add(String(o.customer));
    if (o.assignedTo) assigneeIds.add(String(o.assignedTo));
  }
  const ids = Array.from(new Set([...customerIds, ...assigneeIds]));
  const users = await User.find({ _id: { $in: ids } }).select('name email role');
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const result = list.map((o) => {
    const obj = typeof o.toObject === 'function' ? o.toObject() : o;
    return {
      ...obj,
      customer: byId[String(obj.customer)] || { name: 'Unknown', email: 'N/A' },
      assignedTo: obj.assignedTo ? byId[String(obj.assignedTo)] || null : null,
    };
  });
  return Array.isArray(orders) ? result : result[0];
}

function nextStage(stage) {
  const idx = PRODUCTION_STAGES.indexOf(stage);
  if (idx < 0 || idx === PRODUCTION_STAGES.length - 1) return null;
  return PRODUCTION_STAGES[idx + 1];
}

function previousStage(stage) {
  const idx = PRODUCTION_STAGES.indexOf(stage);
  if (idx <= 0) return null;
  return PRODUCTION_STAGES[idx - 1];
}

function dateKey(d) {
  // YYYY-MM-DD in UTC. Consistent with capacity overrides.
  return new Date(d).toISOString().slice(0, 10);
}

// ─── Queue / Schedule / Active reads ────────────────────────────────────────

/**
 * GET /api/production/queue
 *
 * Orders that are approved but NOT yet scheduled for production. Sorted by
 * priority (urgent → high → medium → low) then by age (oldest first) so
 * the admin sees what needs scheduling most urgently at the top.
 */
/**
 * GET /api/production/my-tasks
 *
 * The Staff Task Board endpoint. Returns ONLY tasks assigned to the calling
 * production_staff user, grouped into kanban columns:
 *   todo        — status='approved' (work has not started yet)
 *   in_progress — status='in_production'
 *   done        — status='ready' (waiting for admin sign-off + customer
 *                  notification)
 *
 * Staff never sees tasks assigned to other staff members. Admin can hit
 * this same endpoint but they'll see only THEIR own assignments — for an
 * across-the-board view they use /queue or /active.
 *
 * Customer PII is stripped server-side via sanitizeOrderForRole.
 */
router.get('/my-tasks', requireProductionStaff, async (req, res) => {
  try {
    const userId = req.user.userId;
    const orders = await Order.find({
      assignedTo: userId,
      status: { $in: ['approved', 'in_production', 'ready'] },
    }).sort({ productionPriority: -1, productionDate: 1, createdAt: 1 });

    const populated = await attachUsers(orders);

    const COLUMNS = ['approved', 'in_production', 'ready'];
    const board = { todo: [], in_progress: [], done: [] };
    for (const o of populated) {
      const sanitized = sanitizeOrderForRole({ ...o }, req.user.role);
      if (o.status === 'approved') board.todo.push(sanitized);
      else if (o.status === 'in_production') board.in_progress.push(sanitized);
      else if (o.status === 'ready') board.done.push(sanitized);
    }

    res.json({
      columns: COLUMNS,
      board,
      counts: {
        todo: board.todo.length,
        in_progress: board.in_progress.length,
        done: board.done.length,
        total: populated.length,
      },
    });
  } catch (err) {
    console.error('GET /production/my-tasks error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/queue', adminMiddleware, async (req, res) => {
  try {
    // Queue = anything waiting to be scheduled into production. Two groups:
    //   1. status='pending'   → just placed by customer, awaiting admin review
    //   2. status='approved' AND productionDate is null → reviewed but not
    //                                                       yet given a start date
    // Admin schedules a date → status auto-promotes to 'approved' (see PUT
    // handler below) → order then moves to the Calendar / Pipeline views.
    //
    // We intentionally exclude in_production/ready/completed/cancelled —
    // those have their own home (Pipeline tab) and shouldn't clutter the
    // "needs scheduling" list.
    const orders = await Order.find({
      $or: [
        { status: 'pending' },
        { status: 'approved', productionDate: { $in: [null, undefined] } },
      ],
    }).sort({ createdAt: 1 });

    // Sort by:
    //   1. Urgency tier (priority > rush > express > standard)
    //   2. Customer's requested delivery date (sooner first)
    //   3. Order creation time (FIFO tiebreaker)
    // Most-at-risk orders bubble to the top.
    const tierRank = { priority: 0, rush: 1, express: 2, standard: 3 };
    const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
    orders.sort((a, b) => {
      const ta = tierRank[a.urgencyTier] ?? 9;
      const tb = tierRank[b.urgencyTier] ?? 9;
      if (ta !== tb) return ta - tb;
      const pa = priorityRank[a.productionPriority] ?? 9;
      const pb = priorityRank[b.productionPriority] ?? 9;
      if (pa !== pb) return pa - pb;
      // Closest requested delivery wins next — these are the ones we'll
      // miss SLA on if we don't pick them up.
      const da = a.requestedDeliveryDate ? new Date(a.requestedDeliveryDate).getTime() : Infinity;
      const db = b.requestedDeliveryDate ? new Date(b.requestedDeliveryDate).getTime() : Infinity;
      if (da !== db) return da - db;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    const populated = await attachUsers(orders);
    jsonForRole(req, res, populated);
  } catch (err) {
    console.error('GET /production/queue error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET /api/production/schedule?date=YYYY-MM-DD          (single-day shortcut)
 *
 * Returns scheduled orders inside the given range, plus per-day workload
 * vs. capacity so the UI can render heatmap-style indicators.
 */
router.get('/schedule', adminMiddleware, async (req, res) => {
  try {
    const { date, from, to } = req.query;

    let start, end;
    if (date) {
      start = new Date(date);
      end = new Date(date);
      end.setUTCHours(23, 59, 59, 999);
    } else if (from && to) {
      start = new Date(from);
      end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
    } else {
      // Default: next 7 days from today
      start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
    }

    // Orders that OVERLAP the visible window — i.e. they started on/before
    // `end` and their due date (or fallback = start + duration) lands on/after
    // `start`. This lets multi-day production runs paint every day they
    // occupy, not just the kickoff day.
    const rawOrders = await Order.find({
      status: { $in: ['approved', 'in_production'] },
      productionDate: { $ne: null, $lte: end },
    }).sort({ productionDate: 1, productionPriority: -1 });

    const orders = rawOrders.filter((o) => {
      if (!o.productionDate) return false;
      const due = o.productionDueDate
        ? new Date(o.productionDueDate)
        : new Date(new Date(o.productionDate).getTime() + (Math.max(1, Number(o.estimatedDurationDays) || 1) - 1) * 86400000);
      return due >= start;
    });

    const populated = await attachUsers(orders);

    // Per-day workload aggregation — credit every day the order spans,
    // not just the start day, so capacity bars reflect actual load.
    const workloadByDay = {};
    for (const o of populated) {
      const s = new Date(o.productionDate);
      s.setUTCHours(0, 0, 0, 0);
      const d = o.productionDueDate
        ? new Date(o.productionDueDate)
        : new Date(s.getTime() + (Math.max(1, Number(o.estimatedDurationDays) || 1) - 1) * 86400000);
      d.setUTCHours(0, 0, 0, 0);
      const cur = new Date(Math.max(s.getTime(), start.getTime()));
      const stop = new Date(Math.min(d.getTime(), end.getTime()));
      while (cur <= stop) {
        const key = cur.toISOString().slice(0, 10);
        if (!workloadByDay[key]) workloadByDay[key] = { date: key, units: 0, orders: 0, ids: [] };
        workloadByDay[key].units += Number(o.totalQty) || 0;
        workloadByDay[key].orders += 1;
        workloadByDay[key].ids.push(o._id);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    // Attach capacity for each day in range
    const capacityDoc = await ProductionCapacity.getOrCreate();
    const overrideMap = Object.fromEntries(capacityDoc.overrides.map((o) => [o.date, o.capacity]));
    const workloadDays = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const isWorking = capacityDoc.workingDays.includes(cursor.getUTCDay());
      const capacity = overrideMap[key] !== undefined
        ? overrideMap[key]
        : (isWorking ? capacityDoc.defaultDailyCapacity : 0);
      const wl = workloadByDay[key] || { units: 0, orders: 0, ids: [] };
      workloadDays.push({
        date: key,
        weekday: cursor.getUTCDay(),
        isWorking,
        capacity,
        units: wl.units,
        orders: wl.orders,
        utilization: capacity > 0 ? wl.units / capacity : null,
        overCapacity: capacity > 0 && wl.units > capacity,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    jsonForRole(req, res, { orders: populated, days: workloadDays, range: { from: start, to: end } });
  } catch (err) {
    console.error('GET /production/schedule error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/active
 * All orders currently mid-production grouped by stage — used to power the
 * Kanban view.
 */
router.get('/active', adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ status: 'in_production' })
      .sort({ productionPriority: -1, productionDate: 1 });
    const populated = await attachUsers(orders);

    const byStage = {};
    for (const stage of PRODUCTION_STAGES) byStage[stage] = [];
    for (const o of populated) {
      const stage = o.productionStage || 'queued';
      if (byStage[stage]) byStage[stage].push(o);
    }
    // byStage holds order objects — run them through the PII filter.
    const byStageFiltered = {};
    for (const k of Object.keys(byStage)) {
      byStageFiltered[k] = byStage[k].map((o) => sanitizeOrderForRole({ ...o }, req.user.role));
    }
    res.json({ stages: PRODUCTION_STAGES, byStage: byStageFiltered });
  } catch (err) {
    console.error('GET /production/active error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/stats
 * Top-line metrics for the dashboard tiles.
 */
router.get('/stats', requireManager, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setUTCHours(23, 59, 59, 999);

    const [queueCount, activeCount, dueToday, overdue, completedToday, byPriority, byStage] = await Promise.all([
      Order.countDocuments({ status: 'approved', productionDate: { $in: [null, undefined] } }),
      Order.countDocuments({ status: 'in_production' }),
      Order.countDocuments({
        status: 'in_production',
        productionDueDate: { $gte: startOfToday, $lte: endOfToday },
      }),
      Order.countDocuments({
        status: 'in_production',
        productionDueDate: { $lt: startOfToday },
      }),
      Order.countDocuments({
        status: { $in: ['ready', 'completed', 'shipped', 'delivered'] },
        productionCompletedAt: { $gte: startOfToday, $lte: endOfToday },
      }),
      Order.aggregate([
        { $match: { status: { $in: ['approved', 'in_production'] } } },
        { $group: { _id: '$productionPriority', count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: 'in_production' } },
        { $group: { _id: '$productionStage', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      queueCount,
      activeCount,
      dueToday,
      overdue,
      completedToday,
      byPriority,
      byStage,
    });
  } catch (err) {
    console.error('GET /production/stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/team
 *
 * Users that can be assigned work. Returns admin + production_staff with
 * per-user workload counts so the admin can balance assignments at a
 * glance — the dropdown in the Schedule modal shows each member's current
 * load as a color-coded badge (light / medium / heavy).
 *
 * Workload columns:
 *   active   — orders currently in_production assigned to this user
 *   blocked  — orders flagged as blocked assigned to this user
 *   qcPending— orders awaiting QC approval (still attributed to the staff
 *              member that submitted them; admin reviews but staff "owns"
 *              until ready)
 *   queued   — orders status='approved' but not yet started, assigned to
 *              this user
 *   loadTier — 'light' (0-2) / 'medium' (3-4) / 'heavy' (5+) bucketing
 *              for UI badges
 */
router.get('/team', requireManager, async (req, res) => {
  try {
    const members = await User.find({ role: { $in: ['admin', 'production_staff'] } })
      .select('name email role')
      .sort({ name: 1 })
      .lean();

    // One aggregation over Order to compute counts per assignedTo + status
    const counts = await Order.aggregate([
      {
        $match: {
          assignedTo: { $ne: null },
          status: { $in: ['approved', 'in_production', 'ready'] },
        },
      },
      {
        $group: {
          _id: {
            assignedTo: '$assignedTo',
            status: '$status',
            blockerStatus: '$blockerStatus',
            qcStatus: '$qcStatus',
          },
          n: { $sum: 1 },
        },
      },
    ]);

    // Roll up by user id
    const byUser = {};
    for (const m of members) {
      byUser[String(m._id)] = { active: 0, blocked: 0, qcPending: 0, queued: 0 };
    }
    for (const row of counts) {
      const uid = String(row._id.assignedTo);
      if (!byUser[uid]) continue;
      if (row._id.blockerStatus === 'active') {
        byUser[uid].blocked += row.n;
      } else if (row._id.qcStatus === 'pending') {
        byUser[uid].qcPending += row.n;
      } else if (row._id.status === 'approved') {
        byUser[uid].queued += row.n;
      } else if (row._id.status === 'in_production') {
        byUser[uid].active += row.n;
      }
    }

    const tierFor = (total) => {
      if (total >= 5) return 'heavy';
      if (total >= 3) return 'medium';
      return 'light';
    };

    const enriched = members.map((m) => {
      const w = byUser[String(m._id)] || { active: 0, blocked: 0, qcPending: 0, queued: 0 };
      const total = w.active + w.qcPending + w.queued; // blocked excluded — they can't be worked
      return { ...m, workload: { ...w, total, loadTier: tierFor(total) } };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /production/team error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Mutating actions (all logged) ──────────────────────────────────────────

/**
 * PUT /api/production/:id/schedule
 *
 * Schedule (or reschedule) an order for production.
 * Body: { productionDate, productionDueDate?, estimatedDurationDays?,
 *         productionPriority?, productionNotes?, assignedTo? }
 *
 * Side effects:
 *   - status → 'in_production' if productionDate is set
 *   - productionStage moves from 'queued' → 'design_review' on first schedule
 *   - productionStartedAt stamped on first stage advance
 *   - Writes 'scheduled' or 'rescheduled' log entry (+ priority/assignee logs
 *     if those changed in the same call)
 */
router.put('/:id/schedule', requireManager, async (req, res) => {
  try {
    const { productionDate, productionDueDate, estimatedDurationDays,
            productionPriority, productionNotes, assignedTo } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const wasScheduled = !!order.productionDate;
    const before = {
      productionDate: order.productionDate,
      productionDueDate: order.productionDueDate,
      productionPriority: order.productionPriority,
      assignedTo: order.assignedTo,
    };

    const actor = await actorSnapshot(req);

    // Apply updates
    if (productionDate !== undefined) {
      order.productionDate = productionDate ? new Date(productionDate) : null;
    }
    if (estimatedDurationDays !== undefined) {
      order.estimatedDurationDays = Math.max(0, Number(estimatedDurationDays) || 0);
    }
    if (productionDueDate !== undefined) {
      order.productionDueDate = productionDueDate ? new Date(productionDueDate) : null;
    } else if (order.productionDate && order.estimatedDurationDays) {
      // Auto-fill due date if not supplied
      const due = new Date(order.productionDate);
      due.setUTCDate(due.getUTCDate() + order.estimatedDurationDays);
      if (!order.productionDueDate || wasScheduled === false) order.productionDueDate = due;
    }
    if (productionPriority !== undefined) order.productionPriority = productionPriority;
    if (productionNotes !== undefined) order.productionNotes = productionNotes;
    if (assignedTo !== undefined) order.assignedTo = assignedTo || null;

    // Status transitions on schedule:
    //   pending  →  in_production  (scheduling a pending order acts as
    //                                implicit approval — admin is committing
    //                                to producing it)
    //   approved →  in_production  (scheduled but not yet started)
    //   anything →  approved       (when admin clears the date)
    //
    // We track whether we just promoted a pending order so we can write an
    // explicit "approved-via-scheduling" audit log entry — operations
    // managers reviewing the timeline later need to know who signed off on
    // accepting the order.
    const wasPending = order.status === 'pending';
    if (order.productionDate) {
      if (!wasScheduled) {
        order.status = 'in_production';
        order.productionStage = 'design_review';
        order.productionStartedAt = new Date();
      } else if (order.status !== 'in_production' && order.status === 'approved') {
        order.status = 'in_production';
      }
    } else {
      // Unscheduling — back to approved queue
      if (order.status === 'in_production') order.status = 'approved';
      order.productionStage = 'queued';
    }

    // Scheduling moves the order into a committed-fulfilment status
    // (in_production). Deduct real stock + write per-SKU 'sale' movements
    // the first time this happens — same idempotency flag as /orders/:id/status.
    if (order.productionDate && !order.inventoryConsumed) {
      await consumeReservedForOrder({
        order,
        actor: { userId: req.user.userId, name: actor.performedByName, role: req.user.role },
        reason: `Scheduled for production (#${String(order._id).slice(-6)})`,
      });
      order.inventoryConsumed = true;
      order.inventoryConsumedAt = new Date();
    }

    await order.save();

    // Audit log
    if (!wasScheduled && order.productionDate) {
      // If we just implicitly approved a pending order by scheduling it,
      // log that distinct event so the timeline is honest about how/why
      // the order got accepted (not via a manual /approve action).
      if (wasPending) {
        await ProductionLog.create({
          order: order._id,
          orderRef: String(order._id).slice(-6),
          type: 'approved',
          to: 'approved-via-schedule',
          note: 'Order auto-approved when production date was set',
          ...actor,
        });
      }
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: 'scheduled',
        to: order.productionDate,
        note: productionNotes || '',
        ...actor,
      });
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: 'started',
        to: 'design_review',
        ...actor,
      });
    } else if (wasScheduled && order.productionDate &&
               +before.productionDate !== +order.productionDate) {
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: 'rescheduled',
        from: before.productionDate,
        to: order.productionDate,
        note: productionNotes || '',
        ...actor,
      });
    } else if (wasScheduled && !order.productionDate) {
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: 'cancelled',
        from: before.productionDate,
        to: null,
        ...actor,
      });
    }
    if (productionPriority && productionPriority !== before.productionPriority) {
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: 'priority_changed',
        from: before.productionPriority,
        to: productionPriority,
        ...actor,
      });
    }
    if (assignedTo !== undefined && String(assignedTo || '') !== String(before.assignedTo || '')) {
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: assignedTo ? 'assigned' : 'unassigned',
        from: before.assignedTo,
        to: assignedTo || null,
        ...actor,
      });
    }

    const populated = await attachUsers(order);
    jsonForRole(req, res, populated);
  } catch (err) {
    console.error('PUT /production/schedule error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/schedule/bulk
 *
 * Schedule many orders to the same date in one call. Used by the queue's
 * multi-select bulk action. Each succeeded order writes its own log entry.
 *
 * Body: { orderIds: [...], productionDate, productionPriority? }
 */
router.post('/schedule/bulk', requireManager, async (req, res) => {
  try {
    const { orderIds, productionDate, productionPriority } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'orderIds array is required' });
    }
    if (!productionDate) {
      return res.status(400).json({ message: 'productionDate is required' });
    }
    const date = new Date(productionDate);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ message: 'productionDate is invalid' });
    }
    const actor = await actorSnapshot(req);

    const results = [];
    for (const id of orderIds) {
      try {
        const order = await Order.findById(id);
        if (!order) {
          results.push({ id, ok: false, error: 'not found' });
          continue;
        }
        const wasScheduled = !!order.productionDate;
        order.productionDate = date;
        if (!order.productionDueDate || !wasScheduled) {
          const due = new Date(date);
          due.setUTCDate(due.getUTCDate() + (order.estimatedDurationDays || 3));
          order.productionDueDate = due;
        }
        if (productionPriority) order.productionPriority = productionPriority;
        if (!wasScheduled) {
          order.status = 'in_production';
          order.productionStage = 'design_review';
          order.productionStartedAt = new Date();
        }
        await order.save();

        await ProductionLog.create({
          order: order._id,
          orderRef: String(order._id).slice(-6),
          type: wasScheduled ? 'rescheduled' : 'scheduled',
          to: date,
          note: 'Bulk schedule',
          ...actor,
        });

        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err.message });
      }
    }

    res.json({ results, scheduledCount: results.filter((r) => r.ok).length });
  } catch (err) {
    console.error('POST /production/schedule/bulk error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/:id/advance
 * Move to the next stage. Body: { direction: 'forward' | 'backward' (default forward) }
 * On reaching 'ready', status flips to 'ready' and productionCompletedAt is stamped.
 */
router.post('/:id/advance', requireProductionStaff, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Task-ownership check for staff: a production_staff user can only
    // advance an order that's been explicitly assigned to them. Admin
    // (Production Manager) is exempt and can move anything anywhere.
    if (req.user.role === 'production_staff') {
      const assignedToId = order.assignedTo ? String(order.assignedTo) : null;
      if (!assignedToId || assignedToId !== String(req.user.userId)) {
        return res.status(403).json({
          message: 'This task is not assigned to you. Ask your manager to reassign it.',
        });
      }
    }

    if (order.status !== 'in_production' && req.body.direction !== 'forward') {
      // Allow advancing FROM approved (kicks off production)
    }

    const direction = req.body.direction === 'backward' ? 'backward' : 'forward';
    const currentStage = order.productionStage || 'queued';
    const target = direction === 'forward' ? nextStage(currentStage) : previousStage(currentStage);
    if (!target) {
      return res.status(400).json({
        message: direction === 'forward'
          ? 'Order is already at the final stage'
          : 'Order is already at the first stage',
      });
    }

    // Quality-control gate: staff cannot push a task to 'ready' directly.
    // Their finish-of-work flow is /qc-photo which puts the order in
    // qcStatus='pending' and the admin approves it via /qc-approve.
    // Admin (= Production Manager) is exempt — they can advance to ready
    // even without a QC photo (rare, but allowed for emergency releases).
    if (req.user.role === 'production_staff' && target === 'ready') {
      return res.status(400).json({
        message: 'Use Submit for QC to finish your work. The manager will approve before this can move to Done.',
        action: 'qc-required',
      });
    }

    const actor = await actorSnapshot(req);
    order.productionStage = target;
    const statusBefore = order.status;

    // Side effects:
    //   - First time we enter in_production, stamp productionStartedAt
    //     and start the time-tracking clock.
    //   - Every time we LEAVE in_production (forward or backward),
    //     accumulate the elapsed time and stop the clock.
    if (currentStage === 'queued' && direction === 'forward' && !order.productionStartedAt) {
      order.productionStartedAt = new Date();
      order.status = 'in_production';
      order.productionLastStartedAt = new Date();
      // Admin notification: staff just kicked off this task
      if (req.user.role === 'production_staff') {
        try {
          const notify = req.app.get('notificationService');
          if (notify?.notifyAdminsOfStaffStart) {
            await notify.notifyAdminsOfStaffStart(order, req.user);
          }
        } catch {/* non-fatal */}
      }
    }
    // Re-enter in_production from backward direction → restart the clock
    if (target === 'design_review' && order.status !== 'in_production') {
      order.status = 'in_production';
      order.productionLastStartedAt = new Date();
    }
    if (target === 'ready') {
      order.productionCompletedAt = new Date();
      order.status = 'ready';
      // Stop the production-time clock + accumulate
      if (order.productionLastStartedAt) {
        const elapsedMs = Date.now() - order.productionLastStartedAt.getTime();
        order.productionTimeMinutes = (order.productionTimeMinutes || 0)
          + Math.max(0, Math.round(elapsedMs / 60000));
        order.productionLastStartedAt = null;
      }
      await ProductionLog.create({
        order: order._id,
        orderRef: String(order._id).slice(-6),
        type: 'completed',
        from: currentStage,
        to: 'ready',
        ...actor,
      });
    }

    await order.save();

    await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'stage_changed',
      from: currentStage,
      to: target,
      note: req.body.note || '',
      ...actor,
    });

    // Mirror the order.status change (if any) into the customer-visible
    // OrderAuditLog + customer notification so the timeline stays accurate
    // regardless of which route flipped the status.
    await syncCustomerTimelineForStatus({
      order,
      fromStatus: statusBefore,
      toStatus: order.status,
      actor: {
        performedBy: actor.performedBy,
        performedByName: actor.performedByName,
        performedByRole: actor.performedByRole,
      },
      note: `Production stage ${currentStage} → ${target}`,
    });

    const populated = await attachUsers(order);
    jsonForRole(req, res, populated);
  } catch (err) {
    console.error('POST /production/advance error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/:id/note
 * Add a free-form note to the production audit log without changing state.
 */
router.post('/:id/note', requireProductionStaff, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: 'note is required' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Staff can only note on tasks assigned to them.
    if (req.user.role === 'production_staff') {
      const assignedToId = order.assignedTo ? String(order.assignedTo) : null;
      if (!assignedToId || assignedToId !== String(req.user.userId)) {
        return res.status(403).json({ message: 'This task is not assigned to you.' });
      }
    }

    const actor = await actorSnapshot(req);
    const log = await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'note',
      note: String(note).trim(),
      ...actor,
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/:id/history
 * Full audit trail for one order, newest first.
 */
router.get('/:id/history', requireProductionStaff, async (req, res) => {
  try {
    // Same ownership rule for staff — they can only see history of tasks
    // assigned to them. Admin can see everything.
    if (req.user.role === 'production_staff') {
      const order = await Order.findById(req.params.id).select('assignedTo');
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const assignedToId = order.assignedTo ? String(order.assignedTo) : null;
      if (!assignedToId || assignedToId !== String(req.user.userId)) {
        return res.status(403).json({ message: 'This task is not assigned to you.' });
      }
    }
    const logs = await ProductionLog.find({ order: req.params.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Capacity management ────────────────────────────────────────────────────

router.get('/capacity', requireManager, async (req, res) => {
  try {
    const cap = await ProductionCapacity.getOrCreate();
    res.json(cap);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/capacity', adminMiddleware, async (req, res) => {
  try {
    const cap = await ProductionCapacity.getOrCreate();
    const { defaultDailyCapacity, workingDays, overrides } = req.body;
    if (defaultDailyCapacity !== undefined) {
      cap.defaultDailyCapacity = Math.max(0, Number(defaultDailyCapacity) || 0);
    }
    if (Array.isArray(workingDays)) {
      cap.workingDays = workingDays.filter((d) => d >= 0 && d <= 6);
    }
    if (Array.isArray(overrides)) {
      cap.overrides = overrides
        .filter((o) => o && o.date && Number.isFinite(Number(o.capacity)))
        .map((o) => ({
          date: o.date,
          capacity: Math.max(0, Number(o.capacity)),
          reason: o.reason || '',
        }));
    }
    cap.updatedAt = new Date();
    cap.updatedBy = req.user.userId;
    await cap.save();
    res.json(cap);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Quality Control endpoints ─────────────────────────────────────────
//
// Lifecycle:
//   Staff: POST /:id/qc-photo  (upload finished-product photo)
//     -> order.qcStatus = 'pending', awaiting admin review
//   Admin: POST /:id/qc-approve
//     -> order.qcStatus = 'approved', status flips to 'ready'
//   Admin: POST /:id/qc-reject  (with reason)
//     -> order.qcStatus = 'rejected', status stays 'in_production' so staff retries

/**
 * POST /api/production/:id/qc-photo
 * Body: { photo: 'data:image/png;base64,...' }
 *
 * Staff uploads a photo of the finished product. Photo is stored as a
 * dataURL on the order document (Cloudinary integration trips on if the
 * env vars are set; see services/imageUpload.js).
 */
router.post('/:id/qc-photo', requireProductionStaff, async (req, res) => {
  try {
    const { photo, note } = req.body;
    if (!photo || typeof photo !== 'string' || !photo.startsWith('data:image')) {
      return res.status(400).json({ message: 'A valid image upload is required.' });
    }
    if (photo.length > 6 * 1024 * 1024) {
      return res.status(413).json({ message: 'Photo too large. Keep under ~4 MB.' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Ownership check for staff
    if (req.user.role === 'production_staff') {
      const assignedToId = order.assignedTo ? String(order.assignedTo) : null;
      if (!assignedToId || assignedToId !== String(req.user.userId)) {
        return res.status(403).json({ message: 'This task is not assigned to you.' });
      }
    }
    if (order.status !== 'in_production') {
      return res.status(400).json({ message: 'Only orders currently in production can be submitted for QC.' });
    }

    // Optional Cloudinary upload — if configured, swap the dataURL for a
    // hosted URL so MongoDB doesn't bloat. Otherwise dataURL is stored.
    let storedPhoto = photo;
    try {
      const { uploadImage } = await import('../services/imageUpload.js');
      const hosted = await uploadImage(photo, { folder: 'customate/qc' });
      if (hosted && typeof hosted === 'string' && hosted.startsWith('http')) {
        storedPhoto = hosted;
      }
    } catch {
      // Best-effort; fall through to dataURL storage
    }

    order.qcPhoto = storedPhoto;
    order.qcPhotoUploadedAt = new Date();
    order.qcPhotoUploadedBy = req.user.userId;
    order.qcStatus = 'pending';
    order.qcRejectionReason = '';
    order.qcRejectedAt = null;
    await order.save();

    const actor = await actorSnapshot(req);
    await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'note',
      note: `QC photo submitted${note ? `: ${note}` : ''}`,
      ...actor,
    });

    // Notify admin: there's something waiting for review.
    try {
      const notify = req.app.get('notificationService');
      if (notify?.notifyAdminsOfQcRequest) {
        await notify.notifyAdminsOfQcRequest(order, req.user);
      }
    } catch {
      /* non-fatal */
    }

    const populated = await attachUsers(order);
    jsonForRole(req, res, populated);
  } catch (err) {
    console.error('POST /production/qc-photo error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/:id/qc-approve
 * Admin marks the QC photo accepted. Order moves to 'ready' and the
 * customer-notification path kicks in via the normal status flow.
 */
router.post('/:id/qc-approve', adminMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.qcStatus !== 'pending') {
      return res.status(400).json({ message: 'No QC review pending on this order.' });
    }

    const actor = await actorSnapshot(req);
    const statusBefore = order.status;
    order.qcStatus = 'approved';
    order.qcApprovedAt = new Date();
    order.qcApprovedBy = req.user.userId;
    order.status = 'ready';
    order.productionStage = 'ready';
    if (!order.productionCompletedAt) order.productionCompletedAt = new Date();
    // Stop time-tracking clock if it was still running
    if (order.productionLastStartedAt) {
      const elapsedMs = Date.now() - order.productionLastStartedAt.getTime();
      order.productionTimeMinutes = (order.productionTimeMinutes || 0)
        + Math.max(0, Math.round(elapsedMs / 60000));
      order.productionLastStartedAt = null;
    }
    await order.save();

    await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'completed',
      note: 'QC approved by manager',
      ...actor,
    });

    // Customer must see "your order is ready" on the timeline + the bell.
    await syncCustomerTimelineForStatus({
      order,
      fromStatus: statusBefore,
      toStatus: 'ready',
      actor: {
        performedBy: actor.performedBy,
        performedByName: actor.performedByName,
        performedByRole: actor.performedByRole,
      },
      note: 'QC approved — order is ready',
    });

    // Quotation orders: auto-publish a chat card with the QC photo and the
    // balance-due request the moment QC is approved. Customer doesn't have
    // to chase anything — the next action is plainly visible.
    if (order.workflowVersion === 'quotation') {
      const bal = order.payments?.balance?.amount || 0;
      await postSystemMessage({
        orderId: order._id,
        body:
          `📸 Your order passed quality control!\n\n` +
          `The finished product photo is now available on your order page. ` +
          `To release the order, please pay the remaining balance of ₱${bal.toLocaleString()} ` +
          `and upload proof of payment here.`,
        meta: { type: 'qc_published', qcPhoto: order.qcPhoto, balanceAmount: bal },
      });
    }

    const populated = await attachUsers(order);
    res.json(populated);
  } catch (err) {
    console.error('POST /production/qc-approve error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/:id/qc-reject
 * Body: { reason: string }
 *
 * Admin rejects the QC photo. Order stays in_production so the assigned
 * staff member can retry. Rejection reason surfaces on the staff card.
 */
router.post('/:id/qc-reject', adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'Provide a rejection reason so staff knows what to fix.' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.qcStatus !== 'pending') {
      return res.status(400).json({ message: 'No QC review pending on this order.' });
    }

    const actor = await actorSnapshot(req);
    order.qcStatus = 'rejected';
    order.qcRejectionReason = String(reason).trim().slice(0, 500);
    order.qcRejectedAt = new Date();
    await order.save();

    await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'note',
      note: `QC REJECTED: ${order.qcRejectionReason}`,
      ...actor,
    });

    const populated = await attachUsers(order);
    res.json(populated);
  } catch (err) {
    console.error('POST /production/qc-reject error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Blocker endpoints ──────────────────────────────────────────────────

/**
 * POST /api/production/:id/flag-blocker
 * Body: { reason: enum, note: string }
 *
 * Staff flags a task as blocked. Priority auto-bumps to urgent so it
 * surfaces at the top of the admin queue; the previous priority is
 * snapshotted on the order so clear-blocker can restore it.
 */
const BLOCKER_REASONS = [
  'material_out_of_stock',
  'machine_issue',
  'design_unclear',
  'customer_change_requested',
  'damaged_during_production',
  'other',
];
router.post('/:id/flag-blocker', requireProductionStaff, async (req, res) => {
  try {
    const { reason, note } = req.body;
    if (!BLOCKER_REASONS.includes(reason)) {
      return res.status(400).json({ message: 'Pick a valid blocker reason.' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (req.user.role === 'production_staff') {
      const assignedToId = order.assignedTo ? String(order.assignedTo) : null;
      if (!assignedToId || assignedToId !== String(req.user.userId)) {
        return res.status(403).json({ message: 'This task is not assigned to you.' });
      }
    }

    const actor = await actorSnapshot(req);
    if (order.blockerStatus !== 'active') {
      order.preBlockerPriority = order.productionPriority || 'medium';
    }
    order.blockerStatus = 'active';
    order.blockerReason = reason;
    order.blockerNote = String(note || '').trim().slice(0, 500);
    order.blockedAt = new Date();
    order.blockedBy = req.user.userId;
    order.productionPriority = 'urgent';
    // Stop the production-time clock while blocked — paused time should
    // not count toward "how long does it take to make this product?"
    if (order.productionLastStartedAt) {
      const elapsedMs = Date.now() - order.productionLastStartedAt.getTime();
      order.productionTimeMinutes = (order.productionTimeMinutes || 0)
        + Math.max(0, Math.round(elapsedMs / 60000));
      order.productionLastStartedAt = null;
    }
    await order.save();

    await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'note',
      note: `BLOCKED (${reason}): ${order.blockerNote}`,
      ...actor,
    });

    // Push admin notification
    try {
      const notify = req.app.get('notificationService');
      if (notify?.notifyAdminsOfBlocker) {
        await notify.notifyAdminsOfBlocker(order, req.user);
      }
    } catch {/* non-fatal */}

    const populated = await attachUsers(order);
    jsonForRole(req, res, populated);
  } catch (err) {
    console.error('POST /production/flag-blocker error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/:id/clear-blocker
 * Body: { reassignTo?: userId, resolution: string }
 *
 * Admin marks the blocker resolved. Restores the previous priority,
 * optionally reassigns the order, and resumes the time-tracking clock.
 */
router.post('/:id/clear-blocker', adminMiddleware, async (req, res) => {
  try {
    const { reassignTo, resolution } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.blockerStatus !== 'active') {
      return res.status(400).json({ message: 'No active blocker on this order.' });
    }

    const actor = await actorSnapshot(req);
    order.blockerStatus = 'cleared';
    order.productionPriority = order.preBlockerPriority || 'medium';
    order.preBlockerPriority = '';

    if (reassignTo) {
      const newStaff = await User.findById(reassignTo).select('role');
      if (newStaff && (newStaff.role === 'production_staff' || newStaff.role === 'admin')) {
        order.assignedTo = newStaff._id;
      }
    }
    // Resume the clock if still in production
    if (order.status === 'in_production' && !order.productionLastStartedAt) {
      order.productionLastStartedAt = new Date();
    }
    await order.save();

    await ProductionLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'note',
      note: `Blocker cleared${resolution ? `: ${resolution}` : ''}`,
      ...actor,
    });

    const populated = await attachUsers(order);
    res.json(populated);
  } catch (err) {
    console.error('POST /production/clear-blocker error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin QC + Blocker dashboards ──────────────────────────────────────

/**
 * GET /api/production/qc-pending
 * Admin view: orders awaiting QC review. Returns the design + finished
 * photo side-by-side so the admin can compare quickly.
 */
router.get('/qc-pending', adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ qcStatus: 'pending' })
      .sort({ qcPhotoUploadedAt: 1 })
      .populate('qcPhotoUploadedBy', 'name email');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/blockers
 * Admin view: active blockers, sorted by raised-time so oldest are top.
 */
router.get('/blockers', adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ blockerStatus: 'active' })
      .sort({ blockedAt: 1 })
      .populate('blockedBy', 'name email');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
