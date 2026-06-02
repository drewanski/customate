import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api';
import { Search, X, Package, Sparkles, ArrowUpDown, AlertCircle } from 'lucide-react';
import { formatPeso } from '../utils/format';
import { productPriceRange } from '../utils/pricing';
import { Pagination, usePagination } from '../components/Pagination';

export function ProductCatalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const categories = ['all', ...Array.from(new Set(products.map((p) => p.category)))];

  useEffect(() => {
    setLoading(true);
    apiRequest('/inventory/public')
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = products
    .filter((p) => selectedCategory === 'all' || p.category === selectedCategory)
    .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      return a.name.localeCompare(b.name);
    });

  // Pagination — resets to page 1 whenever the filter/sort/search changes.
  const { page, pageSize, setPage, setPageSize } = usePagination(12, [searchTerm, selectedCategory, sortBy]);
  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white min-h-screen">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-blue-400/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-purple-400/40 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-14 md:py-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-bold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {products.length} products to customize
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3">
            Pick a product, make it yours
          </h1>
          <p className="text-base md:text-lg text-white/85 max-w-2xl">
            Browse our catalog — every product can be designed with text, images, colors, and patterns in our 3D customizer.
          </p>
        </div>
      </div>

      {/* Filter / search bar */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 -mt-6 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-3 md:p-4">
          <div className="grid md:grid-cols-12 gap-2 md:gap-3 items-stretch">
            {/* Search */}
            <div className="md:col-span-6 relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type="search"
                placeholder="Search products…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-sm text-slate-900 placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category */}
            <div className="md:col-span-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-sm text-slate-900 transition-all cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All categories' : c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="md:col-span-3 relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full h-11 pl-9 pr-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-sm text-slate-900 transition-all cursor-pointer"
              >
                <option value="name">Sort by name</option>
                <option value="price-low">Price: low → high</option>
                <option value="price-high">Price: high → low</option>
              </select>
            </div>
          </div>

          {/* Active filters / result count */}
          {!loading && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                Showing <span className="font-bold text-slate-900">{filteredProducts.length}</span>{' '}
                {filteredProducts.length === 1 ? 'product' : 'products'}
                {selectedCategory !== 'all' && (
                  <>
                    {' '}in{' '}
                    <span className="font-bold text-slate-900">{selectedCategory}</span>
                  </>
                )}
              </p>
              {(searchTerm || selectedCategory !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('all');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Product grid */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="aspect-square bg-slate-100 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
                  <div className="h-5 w-1/3 bg-slate-100 rounded animate-pulse mt-3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredProducts.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Package className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">No products found</h3>
            <p className="text-sm text-slate-500 mb-6">
              Try adjusting your search or filter.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all"
            >
              Reset filters
            </button>
          </div>
        )}

        {/* Product cards */}
        {!loading && filteredProducts.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {paginatedProducts.map((product) => {
              const available = (product.stock || 0) - (product.reservedStock || 0);
              const lowStock = available > 0 && available <= 5;
              return (
                <Link
                  key={product._id}
                  to={`/product/${product._id}`}
                  className="group bg-white rounded-2xl shadow-sm hover:shadow-xl border border-slate-100 overflow-hidden transition-all hover:-translate-y-1"
                >
                  {/* Image */}
                  <div className="relative aspect-square overflow-hidden bg-slate-50">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Category badge */}
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[10px] font-bold text-slate-700 uppercase tracking-wide shadow-sm">
                      {product.category}
                    </div>
                    {/* Stock badge */}
                    {lowStock && (
                      <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                        <AlertCircle className="w-3 h-3" /> Only {available} left
                      </div>
                    )}
                    {available === 0 && (
                      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
                        <span className="px-4 py-1.5 rounded-full bg-white text-xs font-bold text-slate-700">Out of stock</span>
                      </div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 text-base leading-snug mb-1 line-clamp-1">{product.name}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2 min-h-[2lh]">
                      {product.description || ' '}
                    </p>
                    <div className="flex items-center justify-between">
                      {(() => {
                        // Price RANGE — DTF cotton and sublimation polyester have very
                        // different bands, so showing one number is misleading. The
                        // range here is base smallest-size + Logo print → largest-size
                        // + A2 print; same numbers the customer sees on the Customizer.
                        const r = productPriceRange({ category: (product as any).productCategory, name: product.name });
                        return (
                          <div className="flex flex-col">
                            <span className="text-lg font-black text-slate-900">{r.label}</span>
                            {r.min !== r.max && (
                              <span className="text-[10px] font-semibold text-slate-500">est. range</span>
                            )}
                          </div>
                        );
                      })()}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        Customize →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination — shown when there's more than one page */}
        {!loading && filteredProducts.length > 0 && (
          <div className="mt-8 bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
            <Pagination
              page={page}
              total={filteredProducts.length}
              pageSize={pageSize}
              onPageChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48]}
              itemLabel="product"
              itemLabelPlural="products"
            />
          </div>
        )}
      </div>
    </div>
  );
}
