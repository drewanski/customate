import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Badge } from '../components/Badge';
import { useEffect } from 'react';
import { apiRequest } from '../api';
import { Search } from 'lucide-react';
import { formatPeso } from '../utils/format';

export function ProductCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];

  useEffect(() => {
    setLoading(true);
    apiRequest('/inventory/public')
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = products
    .filter(p => selectedCategory === 'all' || p.category === selectedCategory)
    .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      return a.name.localeCompare(b.name);
    });
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Products</h1>
      
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="md:col-span-2">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <Select
          options={categories.map(c => ({ value: c, label: c === 'all' ? 'All Categories' : c }))}
          value={selectedCategory}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value)}
        />
        <Select
          options={[
            { value: 'name', label: 'Name' },
            { value: 'price-low', label: 'Price: Low to High' },
            { value: 'price-high', label: 'Price: High to Low' },
          ]}
          value={sortBy}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}
        />
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
        {filteredProducts.map((product) => (
          <Card key={product._id} hover padding="none">
            <Link to={`/product/${product._id}`}>
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-48 object-cover rounded-t-lg"
              />
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{product.name}</h3>
                  <Badge variant="info" size="sm">{product.category}</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-3">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-600">{formatPeso(product.price)}</span>
                  <span className="text-sm text-gray-500">Stock: {product.stock - (product.reservedStock || 0)} available</span>
                </div>
              </div>
            </Link>
          </Card>
        ))}
      </div>
      
      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No products found</p>
        </div>
      )}
    </div>
  );
}
