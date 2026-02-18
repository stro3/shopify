/**
 * cart.js — ManuKind Demo Shopify Theme
 * Handles: Cart Drawer open/close, Add to Cart, Update qty, Remove item
 * Uses Shopify Ajax Cart API
 */

'use strict';

/* ── Utility: format money ─────────────────────────── */
function formatMoney(cents) {
  const amount = (cents / 100).toFixed(2);
  const format = window.moneyFormat || '${{amount}}';
  return format.replace('{{amount}}', amount).replace('{{amount_no_decimals}}', Math.round(cents / 100));
}

/* ── Utility: show toast notification ─────────────── */
function showToast(message, type = 'success') {
  let toast = document.getElementById('notification-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'notification-toast';
    toast.className = 'notification-toast';
    document.body.appendChild(toast);
  }
  toast.className = `notification-toast${type === 'error' ? ' error' : ''}`;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

/* ── Cart API helpers ──────────────────────────────── */
async function cartAdd(items) {
  const res = await fetch(window.routes.cart_add_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ items })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.description || 'Could not add item to cart.');
  return data;
}

async function cartUpdate(updates) {
  const res = await fetch(window.routes.cart_update_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ updates })
  });
  if (!res.ok) throw new Error('Could not update cart.');
  return await res.json();
}

async function cartChange(id, quantity) {
  const res = await fetch(window.routes.cart_change_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ id, quantity })
  });
  if (!res.ok) throw new Error('Could not update cart.');
  return await res.json();
}

async function cartGet() {
  const res = await fetch('/cart.js', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  return await res.json();
}

/* ── Cart Drawer ───────────────────────────────────── */
class CartDrawer {
  constructor() {
    this.drawer  = document.getElementById('CartDrawer');
    this.overlay = document.getElementById('CartDrawerOverlay');
    if (!this.drawer) return;
    this.bindEvents();
  }

  open() {
    this.drawer.classList.add('is-open');
    this.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    this.drawer.querySelector('.cart-drawer__close')?.focus();
  }

  close() {
    this.drawer.classList.remove('is-open');
    this.overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  bindEvents() {
    this.overlay.addEventListener('click', () => this.close());
    this.drawer.querySelector('.cart-drawer__close')?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.drawer.classList.contains('is-open')) this.close();
    });

    // Cart icon in header
    document.querySelectorAll('[data-cart-drawer-trigger]').forEach(btn => {
      btn.addEventListener('click', () => { this.open(); this.refresh(); });
    });

    // Item qty changes & removes (delegated)
    this.drawer.addEventListener('click', async (e) => {
      const incBtn = e.target.closest('[data-cart-item-increase]');
      const decBtn = e.target.closest('[data-cart-item-decrease]');
      const remBtn = e.target.closest('[data-cart-item-remove]');

      if (incBtn) {
        const key = incBtn.dataset.cartItemIncrease;
        const qtyEl = incBtn.closest('.cart-item__qty').querySelector('span');
        const newQty = parseInt(qtyEl.textContent) + 1;
        await this.updateItem(key, newQty);
      }
      if (decBtn) {
        const key = decBtn.dataset.cartItemDecrease;
        const qtyEl = decBtn.closest('.cart-item__qty').querySelector('span');
        const newQty = Math.max(0, parseInt(qtyEl.textContent) - 1);
        await this.updateItem(key, newQty);
      }
      if (remBtn) {
        await this.updateItem(remBtn.dataset.cartItemRemove, 0);
      }
    });
  }

  async updateItem(key, quantity) {
    try {
      this.setLoading(true);
      const cart = await cartChange(key, quantity);
      this.renderItems(cart);
      this.updateCartCount(cart.item_count);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  async refresh() {
    try {
      this.setLoading(true);
      const cart = await cartGet();
      this.renderItems(cart);
      this.updateCartCount(cart.item_count);
    } catch (err) {
      console.error('Cart refresh failed:', err);
    } finally {
      this.setLoading(false);
    }
  }

  setLoading(state) {
    this.drawer.querySelector('.cart-drawer__items')?.setAttribute('aria-busy', state);
    this.drawer.style.opacity = state ? '0.7' : '1';
  }

  updateCartCount(count) {
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = count;
      el.dataset.count = count;
    });
  }

  renderItems(cart) {
    const container = this.drawer.querySelector('.cart-drawer__items');
    const subtotalEl = this.drawer.querySelector('[data-cart-subtotal]');
    const checkoutBtn = this.drawer.querySelector('[data-cart-checkout]');

    if (!container) return;

    if (cart.item_count === 0) {
      container.innerHTML = `
        <div class="cart-drawer__empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <p>Your cart is empty</p>
          <a href="/collections/all" class="btn btn--primary" style="margin-top:1.6rem" onclick="window.cartDrawer.close()">Continue Shopping</a>
        </div>`;
      if (subtotalEl) subtotalEl.textContent = formatMoney(0);
      if (checkoutBtn) checkoutBtn.setAttribute('disabled', '');
      return;
    }

    if (checkoutBtn) checkoutBtn.removeAttribute('disabled');

    container.innerHTML = cart.items.map(item => `
      <div class="cart-item">
        <div class="cart-item__image">
          ${item.image
            ? `<img src="${item.image}" alt="${item.product_title}" loading="lazy">`
            : `<div style="width:100%;height:100%;background:rgb(var(--color-base-background-2))"></div>`
          }
        </div>
        <div class="cart-item__details">
          <div class="cart-item__title">${item.product_title}</div>
          ${item.variant_title && item.variant_title !== 'Default Title'
            ? `<div class="cart-item__variant">${item.variant_title}</div>` : ''}
          ${item.properties && Object.keys(item.properties).length
            ? `<div class="cart-item__variant">${Object.entries(item.properties).filter(([k]) => !k.startsWith('_')).map(([k,v]) => `${k}: ${v}`).join(' · ')}</div>` : ''}
          <div class="cart-item__bottom">
            <div class="cart-item__qty">
              <button data-cart-item-decrease="${item.key}" aria-label="Decrease quantity">−</button>
              <span>${item.quantity}</span>
              <button data-cart-item-increase="${item.key}" aria-label="Increase quantity">+</button>
            </div>
            <div class="cart-item__price">${formatMoney(item.final_line_price)}</div>
          </div>
          <button class="cart-item__remove" data-cart-item-remove="${item.key}">Remove</button>
        </div>
      </div>
    `).join('');

    if (subtotalEl) subtotalEl.textContent = formatMoney(cart.total_price);
  }
}

/* ── Add To Cart (PDP / quick add) ────────────────── */
async function handleAddToCart(variantId, quantity, properties = {}, buttonEl = null) {
  if (buttonEl) {
    buttonEl.classList.add('btn--loading');
    buttonEl.disabled = true;
  }
  try {
    const items = [{ id: parseInt(variantId), quantity: parseInt(quantity) || 1, properties }];
    await cartAdd(items);
    const cart = await cartGet();
    window.cartDrawer?.updateCartCount(cart.item_count);
    window.cartDrawer?.renderItems(cart);
    showToast('Added to cart!');
    setTimeout(() => window.cartDrawer?.open(), 200);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (buttonEl) {
      buttonEl.classList.remove('btn--loading');
      buttonEl.disabled = false;
    }
  }
}

/* ── PDP: variant selection + qty ─────────────────── */
function initPDP() {
  const form = document.querySelector('[data-product-form]');
  if (!form) return;

  // Variant pill selection
  form.querySelectorAll('.variant-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const optionGroup = pill.closest('[data-option-position]');
      optionGroup?.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      updateSelectedVariant(form);
    });
  });

  // Qty selector
  const qtyInput = form.querySelector('.qty-selector input');
  form.querySelector('[data-qty-increase]')?.addEventListener('click', () => {
    if (qtyInput) qtyInput.value = parseInt(qtyInput.value || 1) + 1;
  });
  form.querySelector('[data-qty-decrease]')?.addEventListener('click', () => {
    if (qtyInput) qtyInput.value = Math.max(1, parseInt(qtyInput.value || 1) - 1);
  });

  // Gallery thumbnails
  form.closest('.product-pdp')?.querySelectorAll('.product-gallery__thumb').forEach((t, i) => {
    t.addEventListener('click', () => {
      const main = document.querySelector('.product-gallery__main img');
      if (main) { main.src = t.querySelector('img').src; main.srcset = t.querySelector('img').srcset || ''; }
      document.querySelectorAll('.product-gallery__thumb').forEach(th => th.classList.remove('active'));
      t.classList.add('active');
    });
  });

  // Add to cart submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const variantId = form.querySelector('[name="id"]')?.value;
    const qty = form.querySelector('.qty-selector input')?.value || 1;
    const btn = form.querySelector('[data-atc-btn]');
    if (!variantId) return showToast('Please select a variant.', 'error');
    await handleAddToCart(variantId, qty, {}, btn);
  });
}

function updateSelectedVariant(form) {
  const selected = [];
  form.querySelectorAll('[data-option-position]').forEach(group => {
    const active = group.querySelector('.variant-pill.active');
    if (active) selected.push(active.textContent.trim());
  });

  const variants = JSON.parse(document.getElementById('product-variants-json')?.textContent || '[]');
  const matched = variants.find(v => {
    const opts = [v.option1, v.option2, v.option3].filter(Boolean);
    return opts.every((o, i) => o === selected[i]);
  });

  if (matched) {
    const idInput = form.querySelector('[name="id"]');
    if (idInput) idInput.value = matched.id;

    const priceEl = form.closest('.product-pdp')?.querySelector('.product-info__price');
    if (priceEl) priceEl.textContent = formatMoney(matched.price);

    const atcBtn = form.querySelector('[data-atc-btn]');
    if (atcBtn) {
      if (!matched.available) {
        atcBtn.textContent = 'Sold Out';
        atcBtn.disabled = true;
      } else {
        atcBtn.textContent = 'Add to Cart';
        atcBtn.disabled = false;
      }
    }
  }
}

/* ── Init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  window.cartDrawer = new CartDrawer();
  initPDP();
});

/* ── Expose globally for BYOB and other modules ───── */
window.cartAdd = cartAdd;
window.cartGet = cartGet;
window.handleAddToCart = handleAddToCart;
window.showToast = showToast;
window.formatMoney = formatMoney;
