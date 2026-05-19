import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronLeft } from 'lucide-react';

/**
 * Terms of Service — Philippines-jurisdiction baseline for a custom-merch shop.
 *
 * Covers the legal essentials: acceptance, account, orders, payment, IP,
 * acceptable use, refunds, liability cap, governing law, contact. Replace
 * `[YOUR COMPANY NAME]` placeholders with real values before launch.
 */
export function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="prose prose-slate max-w-none">
            <p>
              By using CustoMate ("the service"), you agree to these Terms of Service. If you don't
              agree, please don't use the service.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">1. Account</h2>
            <p>
              You must be 18 or older (or have parental consent) to create an account. You're
              responsible for keeping your password confidential. Notify us immediately if you
              suspect unauthorised use.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">2. Orders &amp; pricing</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>All prices are in Philippine Pesos (₱) and inclusive of applicable VAT.</li>
              <li>An order is a binding offer once you complete checkout. We reserve the right to refuse or cancel orders before fulfilment (you'll be notified and refunded).</li>
              <li>Stock is reserved when you place an order. If payment is not received within 24 hours, the reservation expires and the order is auto-cancelled.</li>
              <li>Bulk orders (20+ units) require a 50% deposit to proceed.</li>
              <li>Shipping times and fees are calculated at checkout and may vary by region and courier availability.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">3. Payment</h2>
            <p>
              Payments are processed by PayMongo. We don't store your full card or bank details.
              By submitting payment information you authorise the charge for your order plus any
              applicable shipping or taxes.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">4. Intellectual property of designs</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li><strong>Your design uploads:</strong> you retain all rights to artwork you upload. You grant CustoMate a limited licence to reproduce it on your ordered products and to display it on your order tracking page.</li>
              <li><strong>AI-generated designs:</strong> CustoMate makes no warranty about the copyright status of AI-generated designs. You're responsible for ensuring your design doesn't infringe third-party IP.</li>
              <li><strong>Our software and content:</strong> the CustoMate platform, 3D models, and branding are our property. Don't copy, reverse-engineer, or resell them.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">5. Acceptable use</h2>
            <p>You may not use CustoMate to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Upload or order designs that infringe trademarks, copyrights, or other IP</li>
              <li>Create products that are obscene, defamatory, or incite violence</li>
              <li>Resell our service or expose our APIs to unauthorised parties</li>
              <li>Attempt to compromise the security or availability of our systems</li>
              <li>Use automated scrapers without our written consent</li>
            </ul>
            <p>
              We may, at our discretion, refuse orders or suspend accounts that violate these
              rules.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">6. Refunds &amp; returns</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Because every product is custom-made to your specifications, we don't accept returns based on a change of mind.</li>
              <li>We will refund or replace products that arrive damaged, defective, or materially different from what you ordered. Report issues within 7 days of delivery with photos.</li>
              <li>If we cancel an order before production, you receive a full refund within 3–5 business days.</li>
              <li>Once production has started, only the unfulfilled portion is refundable.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">7. Service availability</h2>
            <p>
              We aim for 99% uptime but don't guarantee it. We may have scheduled or emergency
              maintenance windows. We're not liable for losses arising from temporary
              unavailability of the service.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">8. Limitation of liability</h2>
            <p>
              To the maximum extent allowed by law, CustoMate's total liability for any claim
              arising from your use of the service is limited to the amount you paid us in the
              12 months before the claim. We are not liable for indirect, consequential, or
              punitive damages.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">9. Privacy</h2>
            <p>
              Your privacy matters. See our <Link to="/privacy" className="text-blue-600 hover:underline font-semibold">Privacy Policy</Link> for details on what we collect and how we use it.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">10. Changes to terms</h2>
            <p>
              We may update these terms. Material changes will be announced at least 14 days in
              advance via email. Continued use after the effective date means you accept the new
              terms.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">11. Governing law</h2>
            <p>
              These terms are governed by the laws of the Republic of the Philippines. Disputes
              are resolved in the courts of [YOUR CITY], Philippines.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">12. Contact</h2>
            <p>
              Questions about these terms? Email <a href="mailto:legal@customate.app" className="text-blue-600 hover:underline">legal@customate.app</a>.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          See also: <Link to="/privacy" className="text-blue-600 hover:underline font-semibold">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
