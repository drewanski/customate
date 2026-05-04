import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { apiRequest } from '../api';
import { InventoryItem } from '../data/types';
import { Plus, AlertTriangle, Edit2, Trash2, ImageIcon, Search, Filter } from 'lucide-react';
import { formatPeso } from '../utils/format';

export function AdminInventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Apparel',
    price: 0,
    stock: 0,
    minStock: 10,
    image: '',
    description: '',
    isActive: true
  });
  const [stockAdjustment, setStockAdjustment] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/inventory');
      setInventory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch inventory', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleOpenModal = (item?: any) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        name: item.name,
        sku: item.sku,
        category: item.category,
        price: item.price,
        stock: item.stock,
        minStock: item.minStock ?? 10,
        image: item.image,
        description: item.description || '',
        isActive: item.isActive ?? true
      });
      setStockAdjustment(0);
      setAdjustmentReason('');
    } else {
      setSelectedItem(null);
      setFormData({
        name: '',
        sku: '',
        category: 'Apparel',
        price: 0,
        stock: 0,
        minStock: 10,
        image: '',
        description: '',
        isActive: true
      });
      setStockAdjustment(0);
      setAdjustmentReason('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saveData = { ...formData };
      
      // Apply manual stock adjustment if provided
      if (selectedItem && stockAdjustment !== 0) {
        saveData.stock = formData.stock + stockAdjustment;
      }
      
      if (selectedItem) {
        await apiRequest(`/inventory/${selectedItem._id}`, {
          method: 'PUT',
          body: JSON.stringify(saveData)
        });
      } else {
        await apiRequest('/inventory', {
          method: 'POST',
          body: JSON.stringify(saveData)
        });
      }
      setIsModalOpen(false);
      fetchInventory();
    } catch (err: any) {
      alert(err.message || 'Failed to save item');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await apiRequest(`/inventory/${id}`, { method: 'DELETE' });
      fetchInventory();
    } catch (err: any) {
      alert(err.message || 'Failed to delete item');
    }
  };

  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns: TableColumn<any>[] = [
    {
      key: 'image',
      header: 'Product',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden border border-gray-200">
            {item.image ? (
              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-full h-full p-2 text-gray-400" />
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900 leading-tight">{item.name}</p>
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">{item.sku}</p>
          </div>
        </div>
      )
    },
    { key: 'category', header: 'Category' },
    {
      key: 'price',
      header: 'Price',
      render: (item) => <span className="font-semibold text-blue-600">{formatPeso(item.price)}</span>
    },
    {
      key: 'stock',
      header: 'Quantity',
      render: (item) => {
        const available = item.stock - (item.reservedStock || 0);
        const minStock = item.minStock ?? 10;
        const hasReserved = (item.reservedStock || 0) > 0;
        
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${available <= 0 ? 'text-red-600' : available <= minStock ? 'text-orange-600' : 'text-green-600'}`}>
                {available}
              </span>
              <span className="text-xs text-gray-500">/ {item.stock} total</span>
            </div>
            {hasReserved && (
              <span className="text-xs text-gray-400">
                {item.reservedStock} reserved
              </span>
            )}
          </div>
        );
      }
    },
    {
      key: 'stockStatus',
      header: 'Stock Status',
      render: (item) => {
        const available = item.stock - (item.reservedStock || 0);
        const minStock = item.minStock ?? 10;
        
        if (available <= 0) {
          return <Badge variant="danger">CRITICAL</Badge>;
        } else if (available <= minStock) {
          return <Badge variant="warning">LOW STOCK</Badge>;
        } else {
          return <Badge variant="success">SUFFICIENT</Badge>;
        }
      }
    },
    {
      key: '_id',
      header: 'Actions',
      render: (item) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleOpenModal(item)}>
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(item._id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Inventory</h1>
          <p className="text-gray-500">Manage your product catalog and stock levels.</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-lg shadow-blue-200">
          <Plus className="w-4 h-4 mr-2" />
          New Product
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search by name or SKU..." 
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-0 shadow-xl shadow-gray-200/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Loading inventory...</p>
          </div>
        ) : (
          <Table columns={columns} data={filteredInventory} />
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedItem ? 'Edit Product' : 'Add New Product'}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{selectedItem ? 'Save Changes' : 'Create Product'}</Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Product Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="SKU"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-blue-500/20"
              >
                {['Apparel', 'Accessories', 'Drinkware', 'Stationery', 'Bags', 'Small Goods'].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <Input
              type="number"
              label="Base Price"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              type="number"
              label={selectedItem ? "Current Stock" : "Initial Stock"}
              value={formData.stock}
              onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
              required
            />
            <Input
              type="number"
              label="Min. Stock Alert Level"
              value={formData.minStock}
              onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
              required
            />
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            </div>
          </div>

          {selectedItem && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Manual Stock Adjustment
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Adjustment (+/-)</label>
                  <Input
                    type="number"
                    value={stockAdjustment}
                    onChange={(e) => setStockAdjustment(Number(e.target.value))}
                    placeholder="e.g. +10 or -5"
                  />
                  <p className="text-xs text-gray-500 mt-1">New total: {formData.stock + stockAdjustment}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Reason</label>
                  <Input
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    placeholder="e.g. Stock received, Damaged items..."
                  />
                </div>
              </div>
            </div>
          )}

          <Input
            label="Image URL"
            value={formData.image}
            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
            placeholder="https://..."
            required
          />

          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Product features, materials, etc."
            rows={3}
          />
        </form>
      </Modal>
    </div>
  );
}
