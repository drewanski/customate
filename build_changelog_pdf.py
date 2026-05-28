"""Build the CustoMate change-log as a polished PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether,
)
from reportlab.lib.enums import TA_LEFT

PRIMARY = colors.HexColor('#1e3a8a')   # navy
ACCENT = colors.HexColor('#6366f1')    # indigo
EMERALD = colors.HexColor('#059669')
SLATE = colors.HexColor('#475569')
LIGHT = colors.HexColor('#f1f5f9')


def make_styles():
    base = getSampleStyleSheet()
    styles = {
        'title': ParagraphStyle(
            'CustomTitle', parent=base['Title'],
            fontSize=22, leading=26, textColor=PRIMARY,
            spaceAfter=4, alignment=TA_LEFT,
        ),
        'subtitle': ParagraphStyle(
            'Subtitle', parent=base['Normal'],
            fontSize=11, leading=14, textColor=SLATE,
            spaceAfter=16,
        ),
        'h1': ParagraphStyle(
            'H1', parent=base['Heading1'],
            fontSize=15, leading=18, textColor=PRIMARY,
            spaceBefore=18, spaceAfter=8,
        ),
        'h2': ParagraphStyle(
            'H2', parent=base['Heading2'],
            fontSize=12, leading=15, textColor=ACCENT,
            spaceBefore=12, spaceAfter=6,
        ),
        'body': ParagraphStyle(
            'Body', parent=base['Normal'],
            fontSize=9.5, leading=13, textColor=colors.HexColor('#0f172a'),
        ),
        'small': ParagraphStyle(
            'Small', parent=base['Normal'],
            fontSize=8, leading=11, textColor=SLATE,
        ),
        'mono': ParagraphStyle(
            'Mono', parent=base['Code'],
            fontSize=8, leading=11, fontName='Courier',
            textColor=colors.HexColor('#0f172a'),
            backColor=LIGHT, borderPadding=4,
        ),
    }
    return styles


def make_table(rows, col_widths, header=True):
    """Build a styled table from row-data."""
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#cbd5e1')),
    ]
    if header:
        style += [
            ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 9),
        ]
    # Highlight "DONE" cells in emerald
    for r_idx, row in enumerate(rows):
        for c_idx, cell in enumerate(row):
            txt = (cell if isinstance(cell, str) else getattr(cell, 'text', '')) or ''
            if txt.strip() == 'DONE':
                style.append(('TEXTCOLOR', (c_idx, r_idx), (c_idx, r_idx), EMERALD))
                style.append(('FONT', (c_idx, r_idx), (c_idx, r_idx), 'Helvetica-Bold', 9))
    t.setStyle(TableStyle(style))
    return t


def wrap(text, style):
    """Wrap a string in a Paragraph so the cell auto-wraps."""
    return Paragraph(str(text).replace('\n', '<br/>'), style)


def main():
    doc = SimpleDocTemplate(
        'CustoMate_ChangeLog.pdf',
        pagesize=A4,
        rightMargin=14 * mm, leftMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title='CustoMate Change Log',
        author='ALT + F4',
    )
    s = make_styles()
    body = s['body']

    story = []

    # Title block
    story.append(Paragraph('CustoMate — Complete Change Log', s['title']))
    story.append(Paragraph(
        'A Customer-Guided 3D Customization Platform with Order Management '
        'for Bryle Closet Printing Services. Tracks every system-side fix '
        'against the May 20, 2026 reoral defense compliance form, plus the '
        'design-preview lifecycle, role-system redesign, and customizer polish '
        'shipped in this iteration.',
        s['subtitle']))

    # ─── Compliance Form ──────────────────────────────────────────────────
    story.append(Paragraph('1. Compliance Form Recommendations', s['h1']))

    story.append(Paragraph('Prof. Emil Karlo E. Flores (Panel Chair)', s['h2']))
    flores_rows = [
        ['#', 'Recommendation', 'Status', 'Implementation'],
        ['1', 'Color theme should be more lively', 'DONE',
         'Cinematic navy/aurora studio backdrop, gradient sidebar tabs, brand-tinted icons.'],
        ['2', '3D render shows ideal model per product', 'DONE',
         'AI Lifestyle Preview with body-size presets; 6 product types supported.'],
        ['3', 'Clarify order processing', 'DONE',
         'Status enum + audit log; inventory consumption on approval; OrderTracking timeline.'],
        ['4', 'Calendar efficiency', 'DONE',
         'Production calendar with span highlighting, drop-to-schedule, pending strip.'],
        ['5', 'Demonstrate AI Capability', 'DONE',
         'Gemini text (decals) + image (designs + lifestyle) + Admin AI Assistant.'],
        ['6', 'Finalize complete flow', 'DONE',
         'End-to-end: design → cart → checkout → payment → fulfillment.'],
        ['7', 'Custom presets', 'DONE',
         'Templates Panel with 10 designs across 5 categories.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in flores_rows]
    story.append(make_table(rows, [10*mm, 50*mm, 18*mm, 105*mm]))

    story.append(Paragraph('Prof. Patrick Nicole C. Ramos', s['h2']))
    ramos_rows = [
        ['#', 'Recommendation', 'Status', 'Implementation'],
        ['1', 'Register new user fix', 'DONE',
         'Brevo HTTPS OTP on port 443 (Render blocks SMTP).'],
        ['2', 'Design on different products', 'DONE',
         '3D customizer works on 6 product types.'],
        ['3', 'Calendar shows progress', 'DONE',
         'Start / Due / Day N/M badges + mini progress bars per span.'],
        ['4', 'Account security (users ≠ admin)', 'DONE',
         'adminMiddleware guards every admin route + role-check on JWT.'],
        ['5', 'Inventory validations + audit trail', 'DONE',
         'Append-only StockMovement schema + InventoryAuditLogModal + manual SKU.'],
        ['6', 'Reports fix', 'DONE',
         'analytics.js totalPrice/status enum fix + PDF export.'],
        ['7', 'AI integration on Design', 'DONE',
         'AIDesignAssistant in customizer (Gemini decal gen with auto-sticker).'],
        ['8', 'Appealing customer UI', 'DONE',
         'Checkout redesign, sidebar tabs, smart-sticker banner.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in ramos_rows]
    story.append(make_table(rows, [10*mm, 50*mm, 18*mm, 105*mm]))

    story.append(Paragraph('Prof. Cristine Erica E. Untalan', s['h2']))
    untalan_rows = [
        ['#', 'Recommendation', 'Status', 'Implementation'],
        ['1', 'Email OTP', 'DONE',
         'Brevo HTTPS API; SMS OTP removed.'],
        ['2', 'Calendar functions', 'DONE',
         'Drop-to-schedule, span highlighting, bulk scheduling.'],
        ['3', 'Update UI color', 'DONE',
         'Consistent palette across customer + admin.'],
        ['4', 'Rush orders', 'DONE',
         'Urgency tier badges + rush fee in checkout.'],
        ['5', 'Multi-day schedule (5-6 days)', 'DONE',
         'productionDate → productionDueDate span rendering.'],
        ['6', 'Start & end display', 'DONE',
         'Start badge (blue), Due badge (emerald), Day N/M chip on intermediates.'],
        ['7', 'Export PDF on every table', 'DONE',
         'Orders, Inventory, Users, Coupons, Reports + Audit Log all export PDF.'],
        ['8', '3D works on all products', 'DONE',
         'All 6 product types render in 3D.'],
        ['9', 'Inventory log + manual SKU', 'DONE',
         'Manual SKU input + uniqueness validation; audit log tags actor + role.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in untalan_rows]
    story.append(make_table(rows, [10*mm, 50*mm, 18*mm, 105*mm]))

    story.append(PageBreak())

    # ─── Customization Studio ──────────────────────────────────────────────
    story.append(Paragraph('2. Customization Studio (Core Feature) Polish', s['h1']))
    studio_rows = [
        ['Feature', 'Status', 'Notes'],
        ['Cinematic studio backdrop', 'DONE',
         'Navy + aurora blobs, 9-second pulse, dot-grid texture, spotlight halo.'],
        ['Templates Panel', 'DONE',
         '10 presets across 5 categories (Sports / Minimal / Bold / Fun / Vintage).'],
        ['Quick Shapes panel', 'DONE',
         '12 shapes at 3000px print resolution.'],
        ['ImageRefineModal', 'DONE',
         'Background removal, crop, edge feather, contrast, saturation, Auto-Sticker preset.'],
        ['Auto-Stickerize utility', 'DONE',
         'Runs on every upload + AI generation. Safe fallback on photos / transparent PNGs.'],
        ['Smart Sticker Mode banner', 'DONE',
         'Violet/fuchsia/pink hero in Image tab.'],
        ['Brand-tinted sidebar tabs', 'DONE',
         'Text (blue/indigo), Image (violet/fuchsia), AI (fuchsia/pink), Options (slate).'],
        ['Mirror / Flip image', 'DONE', 'H + V flip buttons.'],
        ['Text effects', 'DONE',
         'Stroke, drop shadow, letter spacing, preset chips (Stadium / Soft / Clean).'],
        ['Opacity control', 'DONE', '10-100% slider on image decal.'],
        ['Undo / Redo + keyboard shortcuts', 'DONE',
         'Ctrl+Z/Y, arrow nudge (Shift = 5%), +/- scale, R rotate, Delete; help via ? button.'],
        ['Snapshot + Share buttons', 'DONE',
         'High-res PNG download + clipboard / native-share.'],
        ['Recently-used colors palette', 'DONE',
         'localStorage-persistent; swatch row under every color picker.'],
        ['AI prompt improved', 'DONE',
         'Gemini asked for die-cut stickers on PURE white background.'],
        ['Image quality: alphaTest 0.05', 'DONE',
         'Soft feathered edges survive without square halo.'],
        ['MeshBasicMaterial (unlit)', 'DONE',
         'Pixel-perfect color fidelity (no ACES tone-mapping wash).'],
        ['Front/back duplication fix', 'DONE',
         'filterDecalByFacing strips back-facing triangles from DecalGeometry.'],
        ['Multi-layer support', 'DONE',
         'LayersPanel + Text / + Image buttons; non-default layers preserved.'],
        ['Page locked to viewport', 'DONE',
         'h-screen + overflow-hidden so the page itself never scrolls.'],
        ['Tighter sidebar density', 'DONE',
         'space-y-6 → space-y-4, padding p-6 → p-5.'],
        ['Print-quality analyzer', 'DONE',
         'DPI check against physical print size for the chosen product.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in studio_rows]
    story.append(make_table(rows, [55*mm, 18*mm, 110*mm]))

    # ─── Design Preview Lifecycle ──────────────────────────────────────────
    story.append(Paragraph('3. Design Preview → Order Lifecycle', s['h1']))
    lifecycle_rows = [
        ['Step', 'Status', 'Notes'],
        ['Studio captures 3D canvas snapshot on Add to Cart', 'DONE',
         '~113KB PNG dataURL stored on the cart item.'],
        ['Cart shows design thumbnail + Custom badge', 'DONE',
         'Falls back to product photo when no preview.'],
        ['Checkout forwards previewImage + designConfig', 'DONE',
         'Was being dropped before; now wired through.'],
        ['Order schema persists previewImage + designConfig', 'DONE',
         'Optional Cloudinary upload swaps dataURL for hosted URL.'],
        ['OrderTracking shows thumbnail + Open + Download', 'DONE',
         'One-click download with order-id-derived filename.'],
        ['Admin OrderDetailDrawer preview + dual download', 'DONE',
         '"Preview PNG" + "Artwork PNG" buttons for production team.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in lifecycle_rows]
    story.append(make_table(rows, [70*mm, 18*mm, 95*mm]))

    # ─── Backend Infrastructure ────────────────────────────────────────────
    story.append(Paragraph('4. Backend Infrastructure', s['h1']))
    backend_rows = [
        ['Item', 'Status', 'Notes'],
        ['Brevo HTTPS API for OTP send', 'DONE',
         'Replaces Gmail SMTP — Render blocks ports 465 + 587.'],
        ['Unified mailer service', 'DONE', 'Brevo → Resend → SMTP fallback chain.'],
        ['MAIL_FROM env var support', 'DONE', 'Sender match against verified Brevo sender.'],
        ['MongoDB Atlas IP whitelist', 'DONE', '0.0.0.0/0 + specific IPs.'],
        ['PayMongo webhook HMAC verification', 'DONE', 'Already in place.'],
        ['Order inventoryConsumed flag', 'DONE', 'Prevents double-deduct on status transitions.'],
        ['Stock consumption on order approval', 'DONE',
         'First transition into approved fires consumeReservedForOrder.'],
        ['StockMovement audit logging', 'DONE',
         'Every restock / sale / adjustment / damage / release tagged with actor name + role.'],
        ['ProductionLog enum includes “approved”', 'DONE',
         'Fixes "Server error" on Schedule modal.'],
        ['Production schedule span query', 'DONE', 'Overlap-based (was start-day only).'],
        ['Analytics totalPrice fix', 'DONE', 'Reports now show real revenue.'],
        ['Status enum normalisation', 'DONE',
         'pending / approved / in_production / ready / completed / shipped / delivered / cancelled / rejected / refunded.'],
        ['Backend image gen prompt', 'DONE',
         'Gemini asked for sticker on white background, hard edges, single subject.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in backend_rows]
    story.append(make_table(rows, [70*mm, 18*mm, 95*mm]))

    story.append(PageBreak())

    # ─── Admin Panel ──────────────────────────────────────────────────────
    story.append(Paragraph('5. Admin Panel Additions', s['h1']))
    admin_rows = [
        ['Item', 'Status', 'Notes'],
        ['Admin Reports PDF + CSV export', 'DONE', '@media print stylesheet, A4 layout.'],
        ['AdminOrders PDF export', 'DONE', 'Via shared PrintablePage component.'],
        ['AdminInventory PDF export', 'DONE', 'Plus Audit Log + Suppliers buttons in hero.'],
        ['AdminUsers PDF export', 'DONE', 'Beside CSV export.'],
        ['AdminCoupons PDF export', 'DONE', 'Beside CSV export.'],
        ['InventoryAuditLogModal', 'DONE',
         'Global cross-SKU ledger with type/date filters + CSV + PDF.'],
        ['Manual SKU on inventory create', 'DONE',
         'Frontend input + backend uniqueness check.'],
        ['Admin AI Assistant model fix', 'DONE',
         'gemini-2.0-flash → gemini-2.5-flash (9 occurrences).'],
        ['Admin Calendar production spans', 'DONE',
         'Multi-day blue blocks with Start / Due / Day N/M badges.'],
        ['Admin Calendar pending strip', 'DONE',
         '"Orders waiting to be scheduled" chips + drop-to-day.'],
        ['Admin Calendar Schedule button per queue item', 'DONE',
         'Opens ScheduleOrderModal.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in admin_rows]
    story.append(make_table(rows, [60*mm, 18*mm, 105*mm]))

    # ─── Role System ───────────────────────────────────────────────────────
    story.append(Paragraph('6. Role System (Two Personas)', s['h1']))
    role_rows = [
        ['Item', 'Status', 'Notes'],
        ['User.role enum', 'DONE',
         'customer / admin (= Production Manager) / guest / production_staff.'],
        ['requireRoles(...) factory', 'DONE',
         'Generic allow-list with 403 + accepted-roles in body.'],
        ['requireManager alias', 'DONE',
         'Aliased to adminMiddleware (Production Manager only).'],
        ['requireProductionStaff alias', 'DONE', 'admin + production_staff.'],
        ['sanitizeOrderForRole', 'DONE',
         'Strips PII + pricing + payment for staff; admin sees full record.'],
        ['jsonForRole wrapper', 'DONE',
         'Applied to every production endpoint that returns orders.'],
        ['Production routes role-gated', 'DONE',
         'queue / schedule / active / history → staff+; stats / team / scheduling / capacity → admin.'],
        ['Inventory routes role-gated', 'DONE',
         'GET → staff+; POST / PUT / DELETE → admin only.'],
        ['Stock movements role-gated', 'DONE',
         'reads → staff+; restock / adjust / damage → admin.'],
        ['Payment / coupons / users / reports', 'DONE',
         'adminMiddleware (Production Manager only).'],
        ['ProtectedRoute accepts role arrays', 'DONE',
         'string OR string[]; admin implicitly allowed.'],
        ['Per-page route gates', 'DONE',
         'Orders / Reviews / Coupons / Users / Reports admin-only; '
         'Production / Calendar / Inventory admin+staff.'],
        ['AdminLayout sidebar by role', 'DONE',
         'Staff sees only Production + Calendar + Inventory; brand label switches.'],
        ['AdminInventory action gating', 'DONE',
         'New Product / Edit / Delete / Restock / Adjust / Suppliers / Export hidden for staff.'],
        ['OrderDetailDrawer Refund gating', 'DONE', 'Hidden for non-admin.'],
        ['Brand label "Production Manager"', 'DONE',
         'Sidebar shows "Production Manager" or "Production Floor".'],
        ['Role pill on user card', 'DONE', 'Always shows current role label.'],
        ['Seed accounts live in DB', 'DONE',
         'manager@ / manager123 (admin) + production.staff@ / staff123 (staff).'],
        ['Migration script', 'DONE',
         'Auto-promotes any leftover production_manager users to admin.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in role_rows]
    story.append(make_table(rows, [60*mm, 18*mm, 105*mm]))

    story.append(PageBreak())

    # ─── Deployment Artifacts ──────────────────────────────────────────────
    story.append(Paragraph('7. Deployment Artifacts', s['h1']))
    deploy_rows = [
        ['File', 'Size', 'Includes'],
        ['customate-frontend.zip', '199 MB',
         'Full app: index.html, .htaccess, assets, models, oversized-t-shirt, products.'],
        ['customate-product-assets.zip', '46 MB',
         'Just products + 3D models (no JS bundles).'],
        ['Backend on Render', 'Auto-deploys',
         'Every push to main triggers redeploy.'],
        ['Frontend on Hostinger', 'Manual',
         'Re-upload zip after each frontend change.'],
    ]
    rows = [[wrap(c, body) for c in r] for r in deploy_rows]
    story.append(make_table(rows, [55*mm, 25*mm, 103*mm]))

    # ─── Commit History ────────────────────────────────────────────────────
    story.append(Paragraph('8. Commit History (this iteration)', s['h1']))
    commits = [
        ('5516419e', 'Collapse production_manager into admin'),
        ('9b01bc34', 'Production Staff + Production Manager roles (initial 3-tier)'),
        ('a58a61f3', 'Wire design preview through cart → order → tracking + admin drawer'),
        ('8120675f', 'Compliance fixes: PDF export on every admin table + manual SKU'),
        ('db2a2233', 'Ship .htaccess via public/ for Vite auto-copy'),
        ('675651f1', 'Fix shape-decal print-quality block + tighten sidebar density'),
        ('f57f8cc5', 'Studio layout: lock to viewport + bold cinematic studio backdrop'),
        ('5fe1bb4d', 'Replace plain slate backdrop with product-photography studio'),
        ('9dccb206', 'Auto-stickerize AI + uploads + cleaner studio sidebar UI'),
        ('a42fbf85', 'Templates gallery + multi-layer + front/back duplication fix'),
        ('e6caf0e4', 'Customizer polish: 12-shape library + persistent recent colors'),
        ('b4bc6a3f', 'Add in-studio image refiner: bg removal + crop + feather'),
        ('7bc14102', 'Switch OTP send to Brevo HTTPS API'),
        ('2717a8a5', 'All SMTP to port 587 + STARTTLS'),
        ('aadf25e9', 'OTP send: explicit SMTP timeouts'),
        ('6568aa7d', 'Fix production scheduling 500 + paint full span on calendar'),
        ('326c5260', 'Deduct stock on order approval + global inventory audit log'),
        ('f6cc97cf', 'Fix Admin AI model name + redesign Checkout page UI'),
        ('8e8eab08', 'Wire Production Hub to pending orders + fix Reports data accuracy'),
    ]
    commit_rows = [['Hash', 'Subject']] + [list(c) for c in commits]
    rows = [[wrap(c, body) for c in r] for r in commit_rows]
    story.append(make_table(rows, [25*mm, 158*mm]))

    # ─── Test Accounts ─────────────────────────────────────────────────────
    story.append(Paragraph('9. Test Accounts (live)', s['h1']))
    accounts = [
        ['Email', 'Password', 'Role'],
        ['manager@customate.com', 'manager123', 'Production Manager (admin)'],
        ['admin@customate.com', 'admin123', 'Production Manager (admin) — original'],
        ['production.staff@customate.com', 'staff123', 'Production Staff'],
    ]
    rows = [[wrap(c, body) for c in r] for r in accounts]
    story.append(make_table(rows, [80*mm, 35*mm, 68*mm]))

    # ─── Closing ───────────────────────────────────────────────────────────
    story.append(Paragraph('10. Outstanding Items', s['h1']))
    story.append(Paragraph(
        'None on the compliance form. All system-side panelist recommendations '
        'are addressed and verified live in the running dev servers.',
        body))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        'Generated automatically from the project change log.',
        s['small']))

    doc.build(story)
    print('Wrote CustoMate_ChangeLog.pdf')


if __name__ == '__main__':
    main()
