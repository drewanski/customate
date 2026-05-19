import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronLeft } from 'lucide-react';

/**
 * Privacy Policy — Philippines DPA 2012 compliant baseline.
 *
 * Drop-in defaults for a custom-merch shop accepting PayMongo payments.
 * Replace `[YOUR COMPANY NAME]`, `[CONTACT EMAIL]`, and `[BUSINESS ADDRESS]`
 * with real values before launch. If you collect biometric or health data,
 * extend Section 2 accordingly.
 */
export function Privacy() {
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="prose prose-slate max-w-none">
            <p>
              CustoMate ("we", "us", "our") respects your privacy and is committed to protecting your
              personal data. This policy explains what we collect, how we use it, and the rights you
              have under the Philippines Data Privacy Act of 2012 (RA 10173) and equivalent laws.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">1. What we collect</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li><strong>Account info</strong> — name, email, phone, password (hashed)</li>
              <li><strong>Order info</strong> — shipping address, items, customization, totals</li>
              <li><strong>Payment info</strong> — processed via PayMongo; we never store full card numbers</li>
              <li><strong>Design uploads</strong> — images you upload for custom prints</li>
              <li><strong>Usage data</strong> — pages visited, design history, anonymised analytics</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">2. How we use it</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Fulfilling and shipping your orders</li>
              <li>Sending transactional emails (order updates, password reset)</li>
              <li>Customer support and dispute resolution</li>
              <li>Detecting fraud and improving service quality</li>
              <li>Legal compliance (tax, audit, court orders)</li>
            </ul>
            <p>
              We do <strong>not</strong> sell your data to third parties. We do not use your
              uploaded designs to train any AI model without your explicit consent.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">3. Sub-processors</h2>
            <p>We share necessary data with the following service providers:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li><strong>MongoDB Atlas</strong> — database hosting</li>
              <li><strong>PayMongo</strong> — payment processing</li>
              <li><strong>Cloudinary</strong> — image storage</li>
              <li><strong>Google Cloud (Gemini)</strong> — AI features (prompts and product context only; no personal data)</li>
              <li><strong>Gmail / SMTP provider</strong> — transactional emails</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">4. Cookies and tracking</h2>
            <p>
              We use a minimal set of cookies for authentication (JWT token) and cart persistence.
              We do not use third-party advertising trackers. Browser localStorage is used to
              remember your design drafts and preferences.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">5. Data retention</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Active account data — kept until you request deletion</li>
              <li>Completed order records — kept for 5 years (Philippine accounting/tax requirements)</li>
              <li>Inactive accounts with no orders — auto-deleted after 24 months</li>
              <li>Audit logs — kept indefinitely (regulatory compliance)</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">6. Your rights</h2>
            <p>Under RA 10173, you have the right to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Be informed about how your data is processed</li>
              <li>Access your data</li>
              <li>Object to processing</li>
              <li>Have inaccurate data corrected</li>
              <li>Request deletion of your account and data</li>
              <li>Receive a portable copy of your data</li>
              <li>Lodge a complaint with the National Privacy Commission (NPC)</li>
            </ul>
            <p>
              To exercise any of these rights, email us at <a href="mailto:privacy@customate.app" className="text-blue-600 hover:underline">privacy@customate.app</a>.
              We respond within 30 days.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">7. Security</h2>
            <p>
              We use industry-standard security practices: HTTPS/TLS in transit, password hashing
              (bcrypt), JWT-based authentication, MongoDB encryption at rest, rate limiting, and
              HMAC-signed webhook verification. We never share or display your full payment details.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">8. Children's privacy</h2>
            <p>
              CustoMate is not directed at children under 13. We do not knowingly collect data
              from minors. If you believe a child has provided us data, contact us and we will
              delete it.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">9. Changes to this policy</h2>
            <p>
              We may update this policy. Material changes will be announced via email to all
              active customers at least 14 days before taking effect.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-3">10. Contact</h2>
            <p>
              Data Protection Officer: <a href="mailto:privacy@customate.app" className="text-blue-600 hover:underline">privacy@customate.app</a><br />
              National Privacy Commission: <a href="https://privacy.gov.ph" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">privacy.gov.ph</a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          See also: <Link to="/terms" className="text-blue-600 hover:underline font-semibold">Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
