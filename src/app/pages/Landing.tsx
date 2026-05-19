import React from 'react';
import { Link } from 'react-router-dom';
import {
  Palette, Truck, ShieldCheck, Zap, Sparkles, Box,
  ArrowRight, Star, MousePointerClick, Brush, Eye, Package, CheckCircle2,
} from 'lucide-react';

export function Landing() {
  const features = [
    {
      icon: Palette,
      title: 'Full customization',
      description: 'Design with text, images, colors, materials, and patterns — see every detail in 3D.',
    },
    {
      icon: Zap,
      title: 'Fast production',
      description: 'Most orders ship within 3–5 business days. Rush options available at checkout.',
    },
    {
      icon: ShieldCheck,
      title: 'Quality guaranteed',
      description: 'Premium materials, vivid prints, and a 100% satisfaction guarantee.',
    },
    {
      icon: Truck,
      title: 'Free shipping',
      description: 'Free standard shipping nationwide on orders over ₱500.',
    },
  ];

  const steps = [
    { icon: MousePointerClick, title: 'Choose your product', description: 'T-shirts, mugs, tote bags, jerseys, and more.' },
    { icon: Brush, title: 'Customize freely', description: 'Add text, upload art, pick colors and materials.' },
    { icon: Eye, title: 'Preview in 3D', description: 'Rotate, zoom, even try it on a body model.' },
    { icon: Package, title: 'Order & track', description: 'Secure checkout, then track your order start to finish.' },
  ];

  return (
    <div className="bg-white">
      {/* ─── Hero — full-bleed image background with aesthetic treatment ──── */}
      <section className="relative overflow-hidden min-h-[680px] md:min-h-[760px] lg:min-h-[820px] flex items-center">
        {/* Background image (the product photo wraps the whole hero) */}
        <img
          src="https://t3.ftcdn.net/jpg/07/22/89/00/360_F_722890094_8fzMLIlRJ3fzgWaO2R5BxZCfK1gByDF4.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover saturate-[1.1] contrast-[1.02]"
        />

        {/* Layered overlays — all stacked over the photo to make text readable
            AND tie the photo into the brand palette */}

        {/* 1. Brand color wash — blue → indigo → purple, multiplied with the photo */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-indigo-900/75 to-purple-900/80 mix-blend-multiply pointer-events-none" />

        {/* 2. Vertical fade — darker at the bottom for content contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/40 to-slate-950/70 pointer-events-none" />

        {/* 3. Left-side fade — extra darkening behind headline for readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/70 via-slate-950/30 to-transparent pointer-events-none" />

        {/* 4. 3D-wireframe grid — subtle theme nod */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* 5. Floating decorative blobs */}
        <div className="absolute top-1/4 -left-32 w-[28rem] h-[28rem] rounded-full bg-blue-500/40 blur-3xl pointer-events-none animate-[pulse_10s_ease-in-out_infinite]" />
        <div className="absolute -bottom-32 right-0 w-[32rem] h-[32rem] rounded-full bg-purple-500/40 blur-3xl pointer-events-none animate-[pulse_12s_ease-in-out_infinite]" />
        <div className="absolute top-0 right-1/4 w-[20rem] h-[20rem] rounded-full bg-pink-500/25 blur-3xl pointer-events-none animate-[pulse_14s_ease-in-out_infinite]" />

        {/* 6. Inner vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.5)] pointer-events-none" />

        {/* Content sitting on top of the image */}
        <div className="relative w-full max-w-7xl mx-auto px-6 lg:px-8 py-20 md:py-28 lg:py-32 text-white">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-xs font-bold mb-6">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Now with live 3D try-on
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight mb-6 drop-shadow-[0_2px_20px_rgba(0,0,0,0.4)]">
              Custom printing,{' '}
              <span className="bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                reimagined in 3D.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-white/85 leading-relaxed mb-8 max-w-xl drop-shadow-[0_1px_10px_rgba(0,0,0,0.3)]">
              Design t-shirts, jerseys, mugs, and bags with our 3D customizer. See every angle, every material, and how it actually looks on a body — before you buy.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 mb-8">
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-bold text-sm text-white bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 transition-all hover:-translate-y-0.5 hover:scale-105"
              >
                Browse products
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/products"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full font-bold text-sm text-white bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/30 transition-all hover:-translate-y-0.5"
              >
                Start customizing
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-white/80">
              <div className="flex items-center gap-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                  ))}
                </div>
                <span className="font-bold text-white ml-1">4.9/5</span>
              </div>
              <span className="text-white/30">•</span>
              <span>1,200+ orders shipped</span>
              <span className="text-white/30">•</span>
              <span className="hidden sm:inline">Made in PH</span>
            </div>
          </div>

          {/* Floating "live preview" stat card pinned to bottom-right */}
          <div className="hidden lg:block absolute bottom-12 right-8 max-w-xs">
            <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20 shadow-2xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
                </span>
                <span className="text-[11px] font-bold text-white tracking-wider uppercase">Live 3D Preview</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">8+</span>
                <span className="text-sm text-white/70">products to customize</span>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-white/70">Starting from</span>
                <span className="text-sm font-black bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text text-transparent">
                  ₱75
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom edge fade — softens transition into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-white pointer-events-none" />
      </section>

      {/* ─── How it works ───────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold mb-4">
              <Box className="w-3.5 h-3.5" />
              The simplest way to design
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">
              How it works
            </h2>
            <p className="text-lg text-slate-600">
              From idea to doorstep in four easy steps.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="relative group bg-gradient-to-br from-white to-slate-50 border border-slate-100 rounded-2xl p-6 hover:shadow-xl hover:shadow-blue-100/50 transition-all hover:-translate-y-1"
              >
                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white border-2 border-slate-100 shadow-sm flex items-center justify-center text-xs font-black text-slate-400">
                  {i + 1}
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-md shadow-blue-200 group-hover:scale-110 transition-transform">
                  <step.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-slate-50 to-blue-50/30">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-4 tracking-tight">
              Why choose CustoMate
            </h2>
            <p className="text-lg text-slate-600">
              Premium materials, professional results, and a frictionless design experience.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-shadow border border-slate-100"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-100 mb-4">
                  <feature.icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ──────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-10 md:p-16 text-center">
            {/* Decorative blobs inside */}
            <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-blue-400/30 blur-3xl" />
            <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl" />

            {/* Grid pattern overlay */}
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />

            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white text-xs font-bold mb-6">
                <CheckCircle2 className="w-3.5 h-3.5" />
                No signup needed to start designing
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight leading-tight">
                Ready to make it yours?
              </h2>
              <p className="text-lg md:text-xl text-white/85 mb-8 max-w-2xl mx-auto">
                Open the customizer and design your first product. It's free to play.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link
                  to="/products"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm text-blue-600 bg-white hover:bg-slate-50 shadow-xl transition-all hover:-translate-y-0.5 hover:scale-105"
                >
                  Get started now
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm text-white bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-all hover:-translate-y-0.5"
                >
                  Create an account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
