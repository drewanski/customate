import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Input } from '../components/Input';
import { useCart } from '../hooks/useCart';
import { formatPeso } from '../utils/format';

export function Cart() {
  const { items, updateQuantity, removeItem, totalAmount } = useCart();
  const navigate = useNavigate();

  const handlePlaceOrder = async () => {
    if (!items.length) return;
    navigate('/checkout');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Your Cart</h1>
        <p className="text-gray-600">{items.length} items</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-600">
            Your cart is empty.
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map(item => (
              <Card key={item.id}>
                <CardContent className="flex flex-col md:flex-row gap-4">
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-full md:w-32 h-32 object-cover rounded"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{item.product.name}</h3>
                    <p className="text-sm text-gray-600">Size: {item.customization.size}</p>
                    <p className="text-sm text-gray-600">Placement: {item.customization.placement}</p>
                    {item.customization.text && (
                      <p className="text-sm text-gray-600">Text: {item.customization.text}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateQuantity(item.id, Math.max(1, Number(e.target.value)))
                      }
                    />
                    <Button variant="outline" onClick={() => removeItem(item.id)}>
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span>{formatPeso(totalAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-3">
                  <span>Total</span>
                  <span className="text-blue-600">{formatPeso(totalAmount)}</span>
                </div>
                <Button className="w-full" onClick={handlePlaceOrder}>
                  Place Order
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
