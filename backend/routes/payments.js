import express from 'express';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, method, amount } = req.body;
    if (!orderId || !method || !amount) {
      return res.status(400).json({ message: 'Order ID, method, and amount are required' });
    }
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Order already paid' });
    }

    const payment = new Payment({
      orderId: order._id,
      method,
      amount: Number(amount),
      status: 'completed',
      transactionId: 'mock_' + Date.now(),
      paidAt: new Date()
    });
    await payment.save();

    order.paidAmount = (order.paidAmount || 0) + Number(amount);
    if (order.paidAmount >= order.requiredPayment) {
      order.paymentStatus = 'paid';
      order.status = 'paid';
      if (order.isBulk) {
        for (const item of order.items) {
          const inv = await Inventory.findOne({ sku: item.sku });
          if (inv) {
            inv.stock -= item.quantity;
            await inv.save();
          }
        }
      }
    } else {
      order.paymentStatus = 'partial';
    }
    await order.save();

    res.status(201).json({ payment, order });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
