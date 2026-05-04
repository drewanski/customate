import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { apiRequest } from '../api';
import { Palette } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { ToastContainer, ToastType } from '../components/Toast';
import { formatPeso } from '../utils/format';

export function ProductDetail() {
  const { productId } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState<any>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [justAdded, setJustAdded] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);

  const addToast = (message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    apiRequest(`/inventory/${productId}`)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => {
    if (product) {
      setSelectedSize(''); // Inventory items don't have sizes
      setSelectedColor(''); // Inventory items don't have colors
    }
  }, [product]);

  const cartCustomization = useMemo(
    () => ({
      text: '',
      font: 'Arial',
      color: selectedColor || '#000000',
      size: selectedSize,
      placement: 'Center Front'
    }),
    [selectedColor, selectedSize]
  );

  const handleAddToCart = () => {
    addItem(product, cartCustomization, quantity);
    addToast('Added to cart', 'success');
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p>Loading...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p>Product not found</p>
      </div>
    );
  }
  
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <Breadcrumbs
        items={[
          { label: 'Products', href: '/products' },
          { label: product.name }
        ]}
        className="mb-6"
      />
      
      <div className="grid lg:grid-cols-2 gap-12">
        <div>
          <img
            src={product.image}
            alt={product.name}
            className="w-full rounded-lg shadow-lg"
          />
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <img
                key={i}
                src={product.image}
                alt={`${product.name} view ${i}`}
                className="w-full aspect-square object-cover rounded border border-gray-200 cursor-pointer hover:border-blue-600 transition-colors"
              />
            ))}
          </div>
        </div>
        
        <div>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
              <Badge variant="info">{product.category}</Badge>
            </div>
            <p className="text-3xl font-bold text-blue-600">{formatPeso(product.price)}</p>
          </div>
          
          <p className="text-gray-600 mb-6">{product.description}</p>
          
          <div className="space-y-6 mb-8">
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Stock</h3>
              <p className="text-sm text-gray-600">{product.stock - (product.reservedStock || 0)} units available</p>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Price</h3>
              <p className="text-2xl font-bold text-blue-600">{formatPeso(product.price)}</p>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-900 mb-3">SKU</h3>
              <p className="text-sm text-gray-600 font-mono">{product.sku}</p>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Quantity</h3>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>
          
          <Card className="bg-blue-50 border-blue-200 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-600 rounded-lg">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Full Customization Available</h4>
                <p className="text-sm text-gray-600">
                  Add your custom text, logo, or design to this product in our easy-to-use studio.
                </p>
              </div>
            </div>
          </Card>
          
          <div className="flex gap-3">
            <Link to={`/product/${productId}/customize`} className="flex-1">
              <Button className="w-full" size="lg">
                Start Customizing
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-10 h-12 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                aria-label="Decrease quantity"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
                className="w-16 h-12 text-center border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-10 h-12 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={handleAddToCart}
              disabled={justAdded}
            >
              {justAdded ? 'Added' : 'Add to Cart'}
            </Button>
          </div>
        </div>
      </div>
      
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Product Details</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <h3 className="font-medium text-gray-900 mb-2">High Quality</h3>
            <p className="text-sm text-gray-600">Premium materials for long-lasting prints</p>
          </Card>
          <Card>
            <h3 className="font-medium text-gray-900 mb-2">Fast Production</h3>
            <p className="text-sm text-gray-600">Most orders ready within 3-5 business days</p>
          </Card>
          <Card>
            <h3 className="font-medium text-gray-900 mb-2">Satisfaction Guaranteed</h3>
            <p className="text-sm text-gray-600">Not happy? We'll make it right</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
