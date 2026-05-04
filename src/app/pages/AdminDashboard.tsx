import React, { useEffect, useState } from 'react';
import { getProfile, apiRequest } from '../api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { Plus, Edit2, Trash2, X, Check, Package, Image as ImageIcon } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface InventoryItem {
  _id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  price: number;
  image?: string;
  description?: string;
  isActive: boolean;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalQty: number;
  totalPrice: number;
  isBulk: boolean;
  status: string;
  paymentStatus: string;
  paidAmount: number;
  requiredPayment: number;
  createdAt: string;
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'inventory' | 'orders'>('overview');
  
  // Inventory Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    stock: 0,
    price: 0,
    image: '',
    description: '',
    isActive: true
  });
  const [formLoading, setFormLoading] = useState(false);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const profileRes = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profileData = await profileRes.json();
      setUser(profileData);

      const [invRes, ordersRes] = await Promise.all([
        fetch(`${API_URL}/inventory`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_URL}/orders`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const invData = await invRes.json();
      const ordersData = await ordersRes.json();

      setInventory(invData);
      setOrders(ordersData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        sku: item.sku,
        category: item.category,
        stock: item.stock,
        price: item.price,
        image: item.image || '',
        description: item.description || '',
        isActive: item.isActive
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        sku: '',
        category: '',
        stock: 0,
        price: 0,
        image: '',
        description: '',
        isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const url = editingItem 
        ? `${API_URL}/inventory/${editingItem._id}`
        : `${API_URL}/inventory`;
      
      const method = editingItem ? 'PUT' : 'POST';
      const token = localStorage.getItem('token');

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!res.ok) throw new Error('Failed to save item');

      await loadData();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving item:', err);
      alert('Failed to save item. Please check the logs.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/inventory/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to delete item');
      
      await loadData();
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="text-center p-6">
            <p className="text-red-600">Access denied. Admins only.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">Welcome back, {user.name}</p>
          </div>
          {activeTab === 'inventory' && (
            <Button onClick={() => handleOpenModal()} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          )}
        </div>

        <div className="flex gap-2 mb-6">
          {(['overview', 'inventory', 'orders'] as const).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'primary' : 'outline'}
              onClick={() => setActiveTab(tab)}
              className="capitalize"
            >
              {tab}
            </Button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Total Inventory Items</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{inventory.length}</p>
                <p className="text-sm text-gray-600">Unique SKUs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Total Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{orders.length}</p>
                <p className="text-sm text-gray-600">All time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bulk Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{orders.filter(o => o.isBulk).length}</p>
                <p className="text-sm text-gray-600">20+ items</p>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'inventory' && (
          <Card>
            <CardHeader>
              <CardTitle>Inventory Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Image</th>
                      <th className="text-left p-2">SKU</th>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-right p-2">Stock</th>
                      <th className="text-right p-2">Price</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-right p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item._id} className="border-b hover:bg-gray-50">
                        <td className="p-2">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded" />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs">{item.sku}</td>
                        <td className="p-2">{item.name}</td>
                        <td className="p-2">{item.category}</td>
                        <td className="p-2 text-right">{item.stock}</td>
                        <td className="p-2 text-right">₱{item.price}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {item.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => handleOpenModal(item)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteItem(item._id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'orders' && (
          <Card>
            <CardHeader>
              <CardTitle>Order Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">ID</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-right p-2">Items</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-center p-2">Bulk</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-center p-2">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b">
                        <td className="p-2 font-mono text-xs">{order.id.slice(-6)}</td>
                        <td className="p-2">
                          <div>
                            <div className="font-medium">{order.customerName}</div>
                            <div className="text-xs text-gray-600">{order.customerEmail}</div>
                          </div>
                        </td>
                        <td className="p-2 text-right">{order.totalQty}</td>
                        <td className="p-2 text-right">₱{order.totalPrice.toFixed(2)}</td>
                        <td className="p-2 text-center">
                          {order.isBulk ? (
                            <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">Bulk</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            order.status === 'paid' ? 'bg-green-100 text-green-800' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <div className="text-xs">
                            <div>{order.paymentStatus}</div>
                            {order.paidAmount > 0 && (
                              <div className="text-gray-600">₱{order.paidAmount}</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add/Edit Inventory Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Product Name"
              value={formData.name}
              onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="SKU"
              value={formData.sku}
              onChange={(e: any) => setFormData({ ...formData, sku: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Category"
              value={formData.category}
              onChange={(e: any) => setFormData({ ...formData, category: e.target.value })}
              required
            />
            <Input
              label="Image URL"
              value={formData.image}
              onChange={(e: any) => setFormData({ ...formData, image: e.target.value })}
              placeholder="https://images.unsplash.com/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Price (₱)"
              type="number"
              value={formData.price}
              onChange={(e: any) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
              required
            />
            <Input
              label="Stock"
              type="number"
              value={formData.stock}
              onChange={(e: any) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
              required
            />
          </div>
          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e: any) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Item is active and visible to customers
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading}>
              {editingItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
