import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Stepper } from '../components/Stepper';
import { Palette, Truck, ShieldCheck, Zap } from 'lucide-react';

export function Landing() {
  const howItWorksSteps = [
    { id: '1', label: 'Choose Product', description: 'Select from our catalog' },
    { id: '2', label: 'Customize', description: 'Design your way' },
    { id: '3', label: 'Preview', description: 'See before you buy' },
    { id: '4', label: 'Checkout', description: 'Secure payment' },
    { id: '5', label: 'Track', description: 'Monitor progress' },
  ];
  
  const features = [
    { icon: Palette, title: 'Full Customization', description: 'Design exactly what you want' },
    { icon: Zap, title: 'Fast Production', description: 'Quick turnaround times' },
    { icon: ShieldCheck, title: 'Quality Guaranteed', description: 'Premium materials' },
    { icon: Truck, title: 'Free Shipping', description: 'On orders over ₱50' },
  ];
  
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-100 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-6">
                Custom Printing Made <span className="text-blue-600">Simple</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Create personalized products with our easy-to-use customization studio.
                From t-shirts to mugs, bring your ideas to life.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/products">
                  <Button size="lg">Browse Products</Button>
                </Link>
                <Link to="/customize">
                  <Button variant="outline" size="lg">Start Customizing</Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600"
                alt="Custom Products"
                className="rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>
      
      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-lg text-gray-600">Get your custom products in 5 easy steps</p>
          </div>
          <div className="max-w-5xl mx-auto">
            <Stepper steps={howItWorksSteps} currentStep={0} />
          </div>
        </div>
      </section>
      
      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Choose Us</h2>
            <p className="text-lg text-gray-600">Quality products, exceptional service</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  <feature.icon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="bg-blue-600 rounded-2xl p-12 text-center text-white">
            <h2 className="text-3xl font-bold mb-4">Ready to Create?</h2>
            <p className="text-xl mb-8 opacity-90">Start customizing your products today</p>
            <Link to="/products">
              <Button size="lg" variant="secondary">
                Get Started Now
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
