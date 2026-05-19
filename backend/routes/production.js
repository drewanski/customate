import express from 'express';
import mongoose from 'mongoose';
import Order, { PRODUCTION_STAGES } from '../models/Order.js';
import User from '../models/User.js';
import ProductionLog from '../models/ProductionLog.js';
import ProductionCapacity from '../models/ProductionCapacity.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Every production endpoint is admin-only. No more public bypass.
router.use(authMiddleware, adminMiddleware);

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
router.get('/queue', async (req, res) => {
  try {
    const orders = await Order.find({
      status: 'approved',
      productionDate: { $in: [null, undefined] },
    }).sort({ createdAt: 1 });

    // Sort by priority weight after fetching (small queues; cheap)
    const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
    orders.sort((a, b) => {
      const ra = priorityRank[a.productionPriority] ?? 9;
      const rb = priorityRank[b.productionPriority] ?? 9;
      if (ra !== rb) return ra - rb;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    const populated = await attachUsers(orders);
    res.json(populated);
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
router.get('/schedule', async (req, res) => {
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

    const orders = await Order.find({
      status: { $in: ['approved', 'in_production'] },
      productionDate: { $gte: start, $lte: end },
    }).sort({ productionDate: 1, productionPriority: -1 });

    const populated = await attachUsers(orders);

    // Per-day workload aggregation
    const workloadByDay = {};
    for (const o of populated) {
      const key = dateKey(o.productionDate);
      if (!workloadByDay[key]) workloadByDay[key] = { date: key, units: 0, orders: 0, ids: [] };
      workloadByDay[key].units += Number(o.totalQty) || 0;
      workloadByDay[key].orders += 1;
      workloadByDay[key].ids.push(o._id);
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

    res.json({ orders: populated, days: workloadDays, range: { from: start, to: end } });
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
router.get('/active', async (req, res) => {
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
    res.json({ stages: PRODUCTION_STAGES, byStage });
  } catch (err) {
    console.error('GET /production/active error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/production/stats
 * Top-line metrics for the dashboard tiles.
 */
router.get('/stats', async (req, res) => {
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
 * Users that can be assigned work (admin + future "production" role).
 */
router.get('/team', async (req, res) => {
  try {
    const team = await User.find({ role: { $in: ['admin', 'production'] } })
      .select('name email role')
      .sort({ name: 1 });
    res.json(team);
  } catch (err) {
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
router.put('/:id/schedule', async (req, res) => {
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

    await order.save();

    // Audit log
    if (!wasScheduled && order.productionDate) {
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
    res.json(populated);
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
router.post('/schedule/bulk', async (req, res) => {
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
router.post('/:id/advance', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
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

    const actor = await actorSnapshot(req);
    order.productionStage = target;

    // Side effects
    if (currentStage === 'queued' && direction === 'forward' && !order.productionStartedAt) {
      order.productionStartedAt = new Date();
      order.status = 'in_production';
    }
    if (target === 'ready') {
      order.productionCompletedAt = new Date();
      order.status = 'ready';
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

    const populated = await attachUsers(order);
    res.json(populated);
  } catch (err) {
    console.error('POST /production/advance error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/production/:id/note
 * Add a free-form note to the production audit log without changing state.
 */
router.post('/:id/note', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: 'note is required' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

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
router.get('/:id/history', async (req, res) => {
  try {
    const logs = await ProductionLog.find({ order: req.params.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Capacity management ────────────────────────────────────────────────────

router.get('/capacity', async (req, res) => {
  try {
    const cap = await ProductionCapacity.getOrCreate();
    res.json(cap);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/capacity', async (req, res) => {
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

export default router;
