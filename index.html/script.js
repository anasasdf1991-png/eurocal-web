// ============================================================
// script.js — منطق تطبيق EuroCal (نسخة ويب HTML/CSS/JS)
// نفس منطق نسخة React Native، بس بدون أي مكتبات خارجية
// ============================================================

const DAILY_GOAL = 2000;
const RING_CIRCUMFERENCE = 2 * Math.PI * 70; // نفس نصف قطر الدائرة بالـ SVG (r=70)
const SEARCH_DEBOUNCE_MS = 500;

// ============================================================
// أدوات مساعدة عامة
// ============================================================
function todayKey() {
  return `meals_${new Date().toISOString().slice(0, 10)}`;
}

function dateKeyFor(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `meals_${d.toISOString().slice(0, 10)}`;
}

function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.hidden = true; }, duration);
}

function navigateTo(screenId) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  window.scrollTo(0, 0);

  // نزامن شريط التنقل السفلي — نفعّل التبويب المطابق لو موجود، أو نطفي الكل
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-nav') === screenId);
  });
}

// ============================================================
// تخزين محلي — نفس دور AsyncStorage بنسخة الموبايل
// ============================================================
function getMeals(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function saveMeals(key, meals) {
  localStorage.setItem(key, JSON.stringify(meals));
}

// ============================================================
// Open Food Facts API — نفس foodApi.js بنسخة الموبايل بالضبط
// ============================================================
const OFF_BASE_URL = 'https://world.openfoodfacts.org';

const COUNTRY_MAP = {
  germany: 'DE', france: 'FR', 'united-kingdom': 'GB',
  netherlands: 'NL', belgium: 'BE', spain: 'ES', italy: 'IT',
};
const COUNTRY_FLAGS = {
  DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', NL: '🇳🇱',
  BE: '🇧🇪', ES: '🇪🇸', IT: '🇮🇹', EU: '🇪🇺',
};

function guessCountry(tags = []) {
  for (const tag of tags) {
    const clean = tag.replace('en:', '').toLowerCase();
    if (COUNTRY_MAP[clean]) return COUNTRY_MAP[clean];
  }
  return 'EU';
}

function normalizeProduct(raw) {
  if (!raw) return null;
  const n = raw.nutriments || {};
  return {
    id: raw.code || raw._id || String(Math.random()),
    barcode: raw.code,
    name: raw.product_name || raw.product_name_en || 'منتج بدون اسم',
    brand: raw.brands ? raw.brands.split(',')[0].trim() : 'غير معروف',
    country: guessCountry(raw.countries_tags),
    caloriesPer100g: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
    protein: n.proteins_100g || 0,
    carbs: n.carbohydrates_100g || 0,
    fat: n.fat_100g || 0,
    servingSize: raw.serving_quantity ? Math.round(raw.serving_quantity) : 100,
  };
}

async function searchProductsAPI(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `${OFF_BASE_URL}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=20` +
    `&fields=code,product_name,brands,countries_tags,nutriments,serving_quantity`;
  const response = await fetch(url);
  const data = await response.json();
  return (data.products || [])
    .map(normalizeProduct)
    .filter((p) => p && p.name !== 'منتج بدون اسم' && p.caloriesPer100g > 0);
}

async function findByBarcodeAPI(barcode) {
  const url = `${OFF_BASE_URL}/api/v2/product/${barcode}.json` +
    `?fields=code,product_name,brands,countries_tags,nutriments,serving_quantity`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status === 1 && data.product) return normalizeProduct(data.product);
  return null;
}

// ============================================================
// دائرة تقدم السعرات
// ============================================================
function updateCalorieRing() {
  const meals = getMeals(todayKey());
  const consumed = meals.reduce((sum, m) => sum + m.calories, 0);
  const progress = Math.min(consumed / DAILY_GOAL, 1);
  const isOver = consumed > DAILY_GOAL;

  const circle = document.getElementById('ring-progress');
  circle.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  circle.style.stroke = isOver ? 'var(--danger)' : '#fff';

  document.getElementById('ring-consumed').textContent = consumed;
  document.getElementById('stat-remaining').textContent = Math.max(DAILY_GOAL - consumed, 0);
  document.getElementById('stat-goal').textContent = DAILY_GOAL;
  document.getElementById('stat-count').textContent = meals.length;
}

function updateHeroDate() {
  const el = document.getElementById('hero-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// ============================================================
// شاشة السجل اليومي — عرض الوجبات
// ============================================================
const MEAL_ICONS = ['🍎', '🥗', '🍞', '🥛', '🍗', '🥚', '🧀', '🍌'];
function iconFor(name) {
  return MEAL_ICONS[name.length % MEAL_ICONS.length];
}

function renderDiary() {
  const meals = getMeals(todayKey());
  const listEl = document.getElementById('meals-list');
  const emptyEl = document.getElementById('empty-state');

  updateHeroDate();
  updateCalorieRing();

  if (meals.length === 0) {
    listEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  listEl.innerHTML = meals.map((m) => `
    <div class="meal-row" data-id="${m.id}">
      <div class="meal-icon-box">${iconFor(m.name)}</div>
      <div class="meal-info">
        <p class="meal-name">${escapeHtml(m.name)}</p>
        <p class="meal-detail">${m.grams}غ · ${m.protein}g بروتين</p>
      </div>
      <span class="meal-calories">${m.calories}</span>
      <button class="meal-delete" data-delete-id="${m.id}">
        <svg width="15" height="15"><use href="#icon-trash"/></svg>
      </button>
    </div>
  `).join('');

  // نربط أزرار الحذف بعد ما نحقن الـ HTML
  listEl.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-id');
      const filtered = getMeals(todayKey()).filter((m) => String(m.id) !== id);
      saveMeals(todayKey(), filtered);
      renderDiary();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// شاشة البحث — نص + باركود
// ============================================================
let searchDebounceTimer = null;
let currentProductForAdd = null; // المنتج المختار مؤقتاً قبل ما ينتقل لشاشة الإضافة

function renderSearchResults(products) {
  const container = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');

  if (products.length === 0) {
    container.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  container.innerHTML = products.map((p) => `
    <button class="product-row" data-product-id="${p.id}">
      <div class="product-info">
        <p class="product-name">${COUNTRY_FLAGS[p.country] || '🌍'} ${escapeHtml(p.name)}</p>
        <p class="product-brand">${escapeHtml(p.brand)}</p>
      </div>
      <div class="cal-badge">
        <span class="cal-badge-value">${p.caloriesPer100g}</span>
        <span class="cal-badge-unit">سعرة/100غ</span>
      </div>
    </button>
  `).join('');

  // نخزن بيانات المنتجات بذاكرة مؤقتة عشان نرجع نجيبها بالضغط
  renderSearchResults._cache = products;

  container.querySelectorAll('[data-product-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-product-id');
      const product = renderSearchResults._cache.find((p) => String(p.id) === id);
      if (product) openAddMealScreen(product);
    });
  });
}

function handleSearchInput(e) {
  const text = e.target.value;
  document.getElementById('search-error').hidden = true;

  clearTimeout(searchDebounceTimer);

  if (text.trim().length < 2) {
    renderSearchResults([]);
    document.getElementById('search-empty').hidden = true;
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    document.getElementById('search-loading').hidden = false;
    try {
      const products = await searchProductsAPI(text);
      renderSearchResults(products);
    } catch (err) {
      document.getElementById('search-error').hidden = false;
      document.getElementById('search-error').textContent =
        'ما قدرنا نتواصل مع قاعدة البيانات. تأكد من الإنترنت.';
    } finally {
      document.getElementById('search-loading').hidden = true;
    }
  }, SEARCH_DEBOUNCE_MS);
}

// ============================================================
// مسح الباركود — عبر BarcodeDetector API (مدعومة بكروم/إيدج/أندرويد)
// مع بديل إدخال يدوي لو المتصفح ما بيدعمها (مثل Safari/iOS حالياً)
// ============================================================
let scannerStream = null;
let scannerLoopId = null;
let scanHandled = false; // حارس يمنع معالجة نفس المسح أكتر من مرة

async function openScanner() {
  scanHandled = false;
  const modal = document.getElementById('scanner-modal');
  const fallbackHint = document.getElementById('scanner-fallback-hint');
  const video = document.getElementById('scanner-video');

  modal.hidden = false;

  const supportsDetector = 'BarcodeDetector' in window;
  fallbackHint.hidden = supportsDetector;

  if (!supportsDetector) {
    // ما في دعم بالمتصفح — بنكتفي بالإدخال اليدوي، بدون تشغيل كاميرا
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = scannerStream;

    const detector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
    });

    const scanLoop = async () => {
      if (scanHandled || modal.hidden) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          handleBarcodeDetected(barcodes[0].rawValue);
          return; // نوقف اللوب بمجرد ما نلاقي نتيجة
        }
      } catch (e) {
        // نتجاهل أخطاء الفريم المفرد ونكمل باللوب
      }
      scannerLoopId = requestAnimationFrame(scanLoop);
    };
    scanLoop();
  } catch (err) {
    // المستخدم رفض إذن الكاميرا أو الجهاز ما فيه كاميرا
    fallbackHint.hidden = false;
    showToast('ما قدرنا نوصل للكاميرا — استخدم الإدخال اليدوي تحت');
  }
}

function closeScanner() {
  document.getElementById('scanner-modal').hidden = true;
  if (scannerLoopId) cancelAnimationFrame(scannerLoopId);
  if (scannerStream) {
    scannerStream.getTracks().forEach((track) => track.stop());
    scannerStream = null;
  }
}

async function handleBarcodeDetected(barcode) {
  if (scanHandled) return;
  scanHandled = true;
  closeScanner();
  await lookupBarcodeAndOpen(barcode);
}

async function lookupBarcodeAndOpen(barcode) {
  showToast('عم نجيب بيانات المنتج...');
  try {
    const product = await findByBarcodeAPI(barcode);
    if (product) {
      openAddMealScreen(product);
    } else {
      showToast('ما لقينا هاد المنتج بقاعدة البيانات');
    }
  } catch (err) {
    showToast('ما قدرنا نتواصل مع قاعدة البيانات، تأكد من الإنترنت');
  }
}

// ============================================================
// شاشة إضافة الوجبة
// ============================================================
function openAddMealScreen(product) {
  currentProductForAdd = product;
  document.getElementById('meal-product-name').textContent = product.name;
  document.getElementById('meal-product-brand').textContent = product.brand;
  document.getElementById('meal-grams').value = product.servingSize;
  recalculateMacros();
  navigateTo('screen-add-meal');
}

function recalculateMacros() {
  if (!currentProductForAdd) return;
  const grams = parseFloat(document.getElementById('meal-grams').value) || 0;
  const factor = grams / 100;
  const p = currentProductForAdd;

  const result = {
    calories: Math.round(p.caloriesPer100g * factor),
    protein: (p.protein * factor).toFixed(1),
    carbs: (p.carbs * factor).toFixed(1),
    fat: (p.fat * factor).toFixed(1),
  };

  document.getElementById('macro-calories').textContent = result.calories;
  document.getElementById('macro-protein').textContent = `${result.protein}g`;
  document.getElementById('macro-carbs').textContent = `${result.carbs}g`;
  document.getElementById('macro-fat').textContent = `${result.fat}g`;

  recalculateMacros._last = result;
}

function confirmAddMeal() {
  if (!currentProductForAdd) return;
  const grams = parseFloat(document.getElementById('meal-grams').value) || 0;
  const result = recalculateMacros._last;

  const meals = getMeals(todayKey());
  meals.push({
    id: Date.now().toString(),
    name: currentProductForAdd.name,
    brand: currentProductForAdd.brand,
    grams,
    ...result,
    time: new Date().toISOString(),
  });
  saveMeals(todayKey(), meals);

  showToast(`تمت الإضافة ✓ أضفنا ${result.calories} سعرة لسجل اليوم`);
  renderDiary();
  navigateTo('screen-diary');
}

// ============================================================
// التقرير الأسبوعي — مفتوح بـ "إعلان مكافأة" (محاكاة على الويب)
// ============================================================
// ملاحظة مهمة: AdMob مخصص للموبايل. على الويب البديل هو Google
// AdSense (بانرات) أو H5 Rewarded Ads عبر منصات زي Google Ad
// Manager. هون حطينا محاكاة بسيطة (تأخير + رسالة) كمكان واضح
// تحط فيه كود تحميل/عرض الإعلان الحقيقي لاحقاً.
function unlockWeeklyReport() {
  showToast('عم نحمّل الإعلان...');
  // 🔻 هون بالضبط مكان استدعاء SDK الإعلان الحقيقي (مثال: gpt رل تايم بيدنغ أو H5 Ads)
  setTimeout(() => {
    renderWeeklyReport();
    navigateTo('screen-report');
  }, 1200);
}

function renderWeeklyReport() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const meals = getMeals(dateKeyFor(i));
    const total = meals.reduce((sum, m) => sum + m.calories, 0);
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
      total,
      isToday: i === 0,
    });
  }

  const maxVal = Math.max(...days.map((d) => d.total), 1);
  const avg = Math.round(days.reduce((s, d) => s + d.total, 0) / days.length);

  document.getElementById('report-avg').textContent = `متوسط استهلاكك: ${avg} سعرة يومياً`;

  document.getElementById('chart-bars').innerHTML = days.map((d) => `
    <div class="chart-bar-col">
      <div class="chart-bar-track">
        <div class="chart-bar ${d.isToday ? 'is-today' : ''}"
             style="height: ${Math.max((d.total / maxVal) * 140, 6)}px"></div>
      </div>
      <span class="chart-bar-value">${d.total}</span>
      <span class="chart-bar-label ${d.isToday ? 'is-today' : ''}">${d.label}</span>
    </div>
  `).join('');
}

// ============================================================
// ربط الأحداث عند تحميل الصفحة
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  renderDiary();

  // التنقل بين الشاشات عبر أزرار الرجوع بالهيدرات الفرعية
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.getAttribute('data-back')));
  });

  // التنقل عبر شريط التبويبات السفلي
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav');
      navigateTo(target);
      if (target === 'screen-report') renderWeeklyReport();
      if (target === 'screen-diary') renderDiary();
    });
  });

  document.getElementById('btn-add-meal').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    renderSearchResults([]);
    document.getElementById('search-empty').hidden = true;
    navigateTo('screen-search');
  });

  document.getElementById('search-input').addEventListener('input', handleSearchInput);

  document.getElementById('btn-scan').addEventListener('click', openScanner);
  document.getElementById('btn-close-scanner').addEventListener('click', closeScanner);

  document.getElementById('btn-manual-barcode').addEventListener('click', () => {
    const code = document.getElementById('manual-barcode').value.trim();
    if (code) {
      scanHandled = true;
      closeScanner();
      lookupBarcodeAndOpen(code);
    }
  });

  document.getElementById('meal-grams').addEventListener('input', recalculateMacros);
  document.getElementById('btn-confirm-add').addEventListener('click', confirmAddMeal);

  document.getElementById('btn-weekly-report').addEventListener('click', unlockWeeklyReport);
});

// نحدّث السجل والدائرة كل ما المستخدم يرجع لتبويب الصفحة (بعد غياب)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderDiary();
});
