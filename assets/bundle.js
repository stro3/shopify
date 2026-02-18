/**
 * bundle.js — BYOB Bundle Logic
 * Handles: product selection, quantity per item, min/max validation,
 *           bundle add-to-cart via Shopify Ajax API, progress bar
 */

'use strict';

class BYOBBundle {
  constructor(container) {
    this.container   = container;
    this.minItems    = parseInt(container.dataset.bundleMin) || 1;
    this.maxItems    = parseInt(container.dataset.bundleMax) || 999;
    this.selections  = new Map(); // variantId -> quantity
    this.totalQty    = 0;

    this.grid        = container.querySelector('[data-byob-grid]');
    this.addBtn      = container.querySelector('[data-byob-add-btn]');
    this.countEl     = container.querySelector('[data-byob-count]');
    this.progressFill = container.querySelector('[data-byob-progress-fill]');
    this.errorEl     = container.querySelector('[data-byob-error]');
    this.progressLabel = container.querySelector('[data-byob-progress-label]');

    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    // Click on product card — select / deselect
    this.grid?.addEventListener('click', (e) => {
      // Block any navigation to product PDP
      const link = e.target.closest('a[href*="/products/"]');
      if (link) { e.preventDefault(); e.stopPropagation(); return; }

      const card = e.target.closest('[data-byob-product]');
      if (!card) return;

      // Qty controls — handle before card toggle
      const incBtn = e.target.closest('[data-byob-qty-inc]');
      const decBtn = e.target.closest('[data-byob-qty-dec]');
      if (incBtn) { e.stopPropagation(); this.changeQty(card, 1); return; }
      if (decBtn) { e.stopPropagation(); this.changeQty(card, -1); return; }

      this.toggleProduct(card);
    });

    // Add bundle to cart
    this.addBtn?.addEventListener('click', () => this.addBundleToCart());
  }

  toggleProduct(card) {
    const variantId = card.dataset.variantId;
    if (!variantId) return;

    if (this.selections.has(variantId)) {
      this.selections.delete(variantId);
      card.classList.remove('selected');
    } else {
      if (this.totalQty >= this.maxItems) {
        this.showError(`Maximum ${this.maxItems} items allowed in this bundle.`);
        return;
      }
      this.selections.set(variantId, 1);
      card.classList.add('selected');
    }
    this.hideError();
    this.recalcTotal();
    this.updateUI();
  }

  changeQty(card, delta) {
    const variantId = card.dataset.variantId;
    if (!variantId) return;

    const current = this.selections.get(variantId) || 0;
    const next = current + delta;

    if (next <= 0) {
      this.selections.delete(variantId);
      card.classList.remove('selected');
    } else {
      if (delta > 0 && this.totalQty >= this.maxItems) {
        this.showError(`Maximum ${this.maxItems} items allowed in this bundle.`);
        return;
      }
      this.selections.set(variantId, next);
      card.classList.add('selected');
    }

    // Update qty display on card
    const qtySpan = card.querySelector('[data-byob-qty-value]');
    if (qtySpan) qtySpan.textContent = next > 0 ? next : 1;

    this.hideError();
    this.recalcTotal();
    this.updateUI();
  }

  recalcTotal() {
    this.totalQty = 0;
    this.selections.forEach(qty => { this.totalQty += qty; });
  }

  updateUI() {
    // Count display
    if (this.countEl) this.countEl.textContent = this.totalQty;

    // Progress bar
    const pct = this.maxItems < 9999 ? Math.min(100, (this.totalQty / this.maxItems) * 100) : 0;
    if (this.progressFill) this.progressFill.style.width = `${pct}%`;
    if (this.progressLabel) {
      this.progressLabel.textContent = this.maxItems < 9999
        ? `${this.totalQty} / ${this.maxItems} items selected`
        : `${this.totalQty} item${this.totalQty !== 1 ? 's' : ''} selected`;
    }

    // Add button state
    if (this.addBtn) {
      const ready = this.totalQty >= this.minItems;
      this.addBtn.disabled = !ready;
      this.addBtn.textContent = ready
        ? `Add Bundle to Cart (${this.totalQty})`
        : `Select at least ${this.minItems} item${this.minItems !== 1 ? 's' : ''}`;
    }

    // Qty controls per card
    this.grid?.querySelectorAll('[data-byob-product]').forEach(card => {
      const vid = card.dataset.variantId;
      const qty = this.selections.get(vid) || 0;
      const qtySpan = card.querySelector('[data-byob-qty-value]');
      if (qtySpan) qtySpan.textContent = qty;
    });
  }

  showError(msg) {
    if (this.errorEl) {
      this.errorEl.textContent = msg;
      this.errorEl.classList.add('visible');
    }
    window.showToast?.(msg, 'error');
  }

  hideError() {
    this.errorEl?.classList.remove('visible');
  }

  async addBundleToCart() {
    if (this.totalQty < this.minItems) {
      this.showError(`Please select at least ${this.minItems} item${this.minItems !== 1 ? 's' : ''} to build your bundle.`);
      return;
    }

    const items = [];
    this.selections.forEach((qty, variantId) => {
      items.push({
        id: parseInt(variantId),
        quantity: qty,
        properties: {
          _bundle: 'byob',
          _bundle_total: this.totalQty
        }
      });
    });

    if (!items.length) return;

    this.addBtn.classList.add('btn--loading');
    this.addBtn.disabled = true;

    try {
      await window.cartAdd(items);
      const cart = await window.cartGet();
      window.cartDrawer?.updateCartCount(cart.item_count);
      window.cartDrawer?.renderItems(cart);
      window.showToast?.('Bundle added to cart!');
      setTimeout(() => window.cartDrawer?.open(), 200);

      // Reset selections
      this.selections.clear();
      this.totalQty = 0;
      this.grid?.querySelectorAll('[data-byob-product].selected').forEach(c => c.classList.remove('selected'));
      this.updateUI();
    } catch (err) {
      this.showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      this.addBtn.classList.remove('btn--loading');
      this.addBtn.disabled = false;
    }
  }
}

/* ── Init all BYOB sections on page ─────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-byob-bundle]').forEach(el => new BYOBBundle(el));

  // Extra safety: disable all product page links on BYOB grid (CSS already does this,
  // JS removes href entirely for keyboard/screen reader safety)
  document.querySelectorAll('[data-byob-grid] a[href*="/products/"]').forEach(link => {
    link.removeAttribute('href');
    link.setAttribute('role', 'presentation');
    link.setAttribute('tabindex', '-1');
    link.style.pointerEvents = 'none';
    link.style.cursor = 'default';
  });
});
