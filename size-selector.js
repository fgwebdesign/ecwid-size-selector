/**
 * Size Selector for Ecwid HOME PAGE - Mushkana
 * Custom App para mostrar variaciones de tallas en la página principal
 * 
 * Características:
 * - Procesamiento en lotes para optimizar performance de API
 * - Cache inteligente en localStorage (12 horas)
 * - Observer para productos cargados dinámicamente
 * - Sin conflictos de hidratación con Ecwid
 * - Retry automático para rate limiting (429)
 * - 100% enfocado en la página HOME
 * 
 * @version 2.0.0
 * @author Mushkana Team
 */

(function() {
    'use strict';
    
    const CONFIG = {
      storeId: 20337891,
      token: 'secret_C95tnqPALb4bmxwf7cJWXHyUWpU31Vmx',
      apiUrl: 'https://app.ecwid.com/api/v3',
      sizeOptionName: 'Talle',
      debug: false, 
      
      cache: {
        enabled: true,
        expirationHours: 12,
        storageKey: 'mushkana_size_cache' 
      },
      
      styles: {
        hoverBorderColor: '#4ecdc4' // Color turquesa
      }
    };
  
    const log = (...args) => {
      if (CONFIG.debug) console.log('[SizeSelector]', ...args);
    };
  
    let simpleObserver = null;
  
    const Cache = {
      getAll() {
        if (!CONFIG.cache.enabled) return {};
        
        try {
          const cached = localStorage.getItem(CONFIG.cache.storageKey);
          if (!cached) return {};
          
          const data = JSON.parse(cached);
          const now = Date.now();
          
          if (data.timestamp && (now - data.timestamp) > (CONFIG.cache.expirationHours * 60 * 60 * 1000)) {
            log('⏰ Caché expirado, limpiando...');
            this.clear();
            return {};
          }
          
          return data.products || {};
        } catch (e) {
          log('⚠️ Error leyendo caché:', e);
          return {};
        }
      },
  
      get(productId) {
        const cache = this.getAll();
        return cache[productId] || null;
      },
  
      set(productId, variations) {
        if (!CONFIG.cache.enabled) return;
        
        try {
          const cache = this.getAll();
          cache[productId] = variations;
          
          const data = {
            timestamp: Date.now(),
            products: cache
          };
          
          localStorage.setItem(CONFIG.cache.storageKey, JSON.stringify(data));
          log(`💾 Variaciones guardadas en caché para producto ${productId}`);
        } catch (e) {
          log('⚠️ Error guardando en caché:', e);
        }
      },
  
      clear() {
        try {
          localStorage.removeItem(CONFIG.cache.storageKey);
          log('🧹 Caché limpiado');
        } catch (e) {
          log('⚠️ Error limpiando caché:', e);
        }
      },
  
      getStats() {
        const cache = this.getAll();
        const count = Object.keys(cache).length;
        return {
          productsInCache: count,
          cacheSize: new Blob([JSON.stringify(cache)]).size + ' bytes'
        };
      }
    };
  
    // ============================================
    // API CALLS
    // ============================================
  
    async function getProductVariations(productId, retryCount = 0) {
      const cached = Cache.get(productId);
      if (cached) {
        return cached;
      }
  
      try {
        const url = `${CONFIG.apiUrl}/${CONFIG.storeId}/products/${productId}/combinations`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${CONFIG.token}`
          }
        });
  
        if (!response.ok) {
          if (response.status === 429 && retryCount < 3) {
            // Rate limiting - esperar y reintentar
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
            return getProductVariations(productId, retryCount + 1);
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const variations = await response.json();
        
        Cache.set(productId, variations);
        
        return variations;
      } catch (error) {
        if (retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return getProductVariations(productId, retryCount + 1);
        }
        return [];
      }
    }
  
    // ============================================
    // PROCESAMIENTO DE DATOS
    // ============================================
  
    function extractSizes(variations) {
      if (!Array.isArray(variations) || variations.length === 0) {
        return [];
      }
  
      const sizes = variations
        .map(variation => {
          const sizeOption = variation.options?.find(
            opt => opt.name === CONFIG.sizeOptionName || 
                   opt.name === 'Size' || 
                   opt.name === 'Talla' ||
                   opt.name === 'Talle' ||
                   opt.name === 'TALLE' ||
                   opt.name === 'TALLES' ||
                   opt.name === 'Talles' ||
                   opt.name === 'size' ||
                   opt.name === 'talle' ||
                   opt.name === 'talles'
          );
          
          if (!sizeOption) {
            return null;
          }
  
          // Según la documentación de Ecwid, usar 'inStock' o 'unlimited'
          const inStock = variation.inStock !== false && (variation.unlimited || variation.inStock === true);
  
          return {
            value: sizeOption.value,
            inStock: inStock,
            variationId: variation.id,
            sku: variation.sku,
            price: variation.price || variation.defaultDisplayedPrice
          };
        })
        .filter(size => size !== null);
  
      const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6, 'XXXL': 7 };
      sizes.sort((a, b) => {
        const orderA = sizeOrder[a.value.toUpperCase()] || 999;
        const orderB = sizeOrder[b.value.toUpperCase()] || 999;
        return orderA - orderB;
      });
  
      return sizes;
    }
  
    // ============================================
    // CREACIÓN DE UI
    // ============================================
  
    function createSizeSelector(sizes, productId) {
      if (sizes.length === 0) return null;
  
      const container = document.createElement('div');
      container.className = 'mushkana-size-selector';
      container.setAttribute('data-product-id', productId);
  
      // Contenedor de botones
      const buttonsContainer = document.createElement('div');
      buttonsContainer.className = 'mushkana-size-buttons';
      container.appendChild(buttonsContainer);
  
      // Crear botones de tallas
      sizes.forEach(size => {
        const button = document.createElement('button');
        button.textContent = size.value;
        button.className = 'mushkana-size-button';
        button.setAttribute('data-variation-id', size.variationId);
        button.setAttribute('data-size', size.value);
        button.setAttribute('data-in-stock', size.inStock);
        button.setAttribute('type', 'button');
  
        if (!size.inStock) {
          // AGOTADO: Agregar clase específica
          button.classList.add('mushkana-size-button--out-of-stock');
          button.disabled = true;
          button.title = `Talla ${size.value} - Agotado`;
        } else {
          // DISPONIBLE: Configurar título y eventos
          button.title = `Seleccionar talla ${size.value}`;
          
          // Click handler - HOME: El link del producto ya está disponible
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // HOME: El producto siempre tiene su link directo
            const productLink = document.querySelector(`#product-${productId} a`);
            if (productLink) {
              const baseUrl = productLink.href.split('?')[0];
              window.location.href = `${baseUrl}?variation=${size.variationId}`;
            }
          });
        }
  
        buttonsContainer.appendChild(button);
      });
  
      return container;
    }
  
    // ============================================
    // MANIPULACIÓN DEL DOM
    // ============================================
  
    function extractProductId(productElement) {
      // SOLO PARA HOME: productos tienen ID en formato "product-XXXXXX"
      if (productElement.id && productElement.id.startsWith('product-')) {
        return productElement.id.replace('product-', '');
      }
      
      return null;
    }
  
    async function processProduct(productElement) {
      // PROTECCIÓN 1: Ya fue procesado
      if (productElement.dataset.sizeSelectorProcessed === 'true') {
        return;
      }
      
      // PROTECCIÓN 2: Marcar INMEDIATAMENTE como procesado
      productElement.dataset.sizeSelectorProcessed = 'true';
      
      // PROTECCIÓN 3: Verificar si ya existe un selector
      const existingSelector = productElement.querySelector('.mushkana-size-selector');
      if (existingSelector) {
        return;
      }
  
      const productId = extractProductId(productElement);
      if (!productId) {
        return;
      }
  
      const variations = await getProductVariations(productId);
      if (variations.length === 0) {
        return;
      }
  
      const sizes = extractSizes(variations);
      if (sizes.length === 0) {
        return;
      }
  
      const sizeSelector = createSizeSelector(sizes, productId);
      if (!sizeSelector) {
        return;
      }
  
      // PROTECCIÓN 4: Verificar de nuevo antes de insertar (evitar hidratación)
      const doubleCheck = productElement.querySelector('.mushkana-size-selector');
      if (doubleCheck) {
        return;
      }
  
      // PROTECCIÓN 5: Verificar que el elemento siga en el DOM
      if (!document.body.contains(productElement)) {
        return;
      }
  
      // HOME: Insertar después del precio usando requestAnimationFrame para evitar hidratación
      requestAnimationFrame(() => {
        const priceElement = productElement.querySelector('.ins-component__price');
        if (priceElement && !productElement.querySelector('.mushkana-size-selector')) {
          priceElement.insertAdjacentElement('afterend', sizeSelector);
        }
      });
    }
  
    let isProcessing = false;
    let processingTimeout = null;
    
    async function processAllProducts() {
      // Evitar procesamiento simultáneo
      if (isProcessing) {
        return;
      }
      
      // Cancelar cualquier procesamiento pendiente
      if (processingTimeout) {
        clearTimeout(processingTimeout);
        processingTimeout = null;
      }
      
      isProcessing = true;
      
      try {
        // Esperar a que el DOM esté completamente estable
        await new Promise(resolve => {
          processingTimeout = setTimeout(resolve, 100);
        });
        
        // SOLO productos del HOME que NO han sido procesados
        const homeProducts = document.querySelectorAll('.ins-component__item:not([data-size-selector-processed="true"])');
        
        if (homeProducts.length === 0) {
          isProcessing = false;
          return;
        }
  
        // Procesar productos en lotes para evitar saturar la API
        const batchSize = 5; // Procesar 5 productos a la vez
        const batches = [];
        
        for (let i = 0; i < homeProducts.length; i += batchSize) {
          batches.push(Array.from(homeProducts).slice(i, i + batchSize));
        }
  
        // Procesar cada lote secuencialmente
        for (const batch of batches) {
          const promises = batch.map(async (productElement) => {
            try {
              const productId = extractProductId(productElement);
              if (!productId) return;
              
              await processProduct(productElement);
            } catch (error) {
              // NO fallar toda la cadena, continuar con los demás
            }
          });
  
          // Esperar a que el lote se complete antes del siguiente
          await Promise.allSettled(promises);
          
          // Pequeña pausa entre lotes para no saturar la API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } finally {
        isProcessing = false;
        processingTimeout = null;
      }
    }
  
    function cleanupPreviousSelectors() {
      // Limpiar solo los duplicados, no todos los selectores
      const products = document.querySelectorAll('.ins-component__item');
      
      products.forEach(product => {
        const selectors = product.querySelectorAll('.mushkana-size-selector');
        
        // Si hay más de un selector, eliminar todos excepto el primero
        if (selectors.length > 1) {
          for (let i = 1; i < selectors.length; i++) {
            selectors[i].remove();
          }
        }
      });
    }
  
    // ============================================
    // OBSERVADOR DE PRODUCTOS DINÁMICOS
    // ============================================
  
    let productObserver = null;
    let processingQueue = new Set();
    let debounceTimer = null;
  
    async function processQueue() {
      if (processingQueue.size === 0) return;
      
      const productsToProcess = Array.from(processingQueue);
      processingQueue.clear();
  
      // Procesar en paralelo con delay escalonado
      const promises = productsToProcess.map(async (productElement, index) => {
        try {
          // Verificar que no esté ya procesado antes de continuar
          if (productElement.dataset.sizeSelectorProcessed === 'true') {
            return;
          }
          
          // Delay escalonado para no saturar la API
          await new Promise(resolve => setTimeout(resolve, index * 100));
          await processProduct(productElement);
          
        } catch (error) {
          // Continuar con los demás en caso de error
        }
      });
  
      await Promise.allSettled(promises);
    }
  
    function startObservingProducts() {
      // Si ya existe un observer, NO crear otro
      if (productObserver) {
        return;
      }
  
      // Esperar a que el contenedor esté disponible
      const waitForContainer = () => {
        const homeContainer = document.querySelector('.ins-component__items');
        
        if (!homeContainer) {
          setTimeout(waitForContainer, 500);
          return;
        }
  
        // Configurar el MutationObserver con debounce optimizado
        productObserver = new MutationObserver((mutations) => {
          let newProductsFound = false;
  
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              // Solo elementos del DOM
              if (node.nodeType !== Node.ELEMENT_NODE) return;
              
              // Verificar si es un producto del HOME
              if (node.classList && node.classList.contains('ins-component__item')) {
                // Solo agregar si NO ha sido procesado
                if (node.dataset.sizeSelectorProcessed !== 'true') {
                  processingQueue.add(node);
                  newProductsFound = true;
                }
              } else if (node.querySelectorAll) {
                // Buscar productos del HOME dentro del nodo agregado
                const homeProducts = node.querySelectorAll('.ins-component__item:not([data-size-selector-processed="true"])');
                
                if (homeProducts.length > 0) {
                  homeProducts.forEach(productElement => {
                    processingQueue.add(productElement);
                  });
                  newProductsFound = true;
                }
              }
            });
          });
  
          // Debounce: esperar 300ms antes de procesar la cola
          if (newProductsFound) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              processQueue();
            }, 300);
          }
        });
  
        // Observar SOLO el contenedor de productos del HOME
        productObserver.observe(homeContainer, {
          childList: true,
          subtree: true,
          attributes: false, // No observar cambios de atributos
          characterData: false // No observar cambios de texto
        });
      };
  
      waitForContainer();
    }
  
    // ============================================
    // CARGA DE ESTILOS
    // ============================================
  
    function loadStyles() {
      // Verificar si ya se cargaron los estilos
      if (document.querySelector('#mushkana-size-selector-styles')) {
        return;
      }
  
      const link = document.createElement('link');
      link.id = 'mushkana-size-selector-styles';
      link.rel = 'stylesheet';
      link.href = 'https://ecwid-size-selector.vercel.app/size-selector.css';
      link.type = 'text/css';
      
      document.head.appendChild(link);
      log('🎨 Estilos CSS cargados');
    }
  
    // ============================================
    // INICIALIZACIÓN PROFESIONAL PARA CUSTOM APP
    // ============================================
  
    function init() {
      // PROTECCIÓN: Solo ejecutar UNA vez
      if (window.MushkanaSizeSelectorInitialized) {
        return;
      }
      
      // Marcar INMEDIATAMENTE como inicializado
      window.MushkanaSizeSelectorInitialized = true;
  
      // Cargar estilos CSS una sola vez
      loadStyles();
  
      // Verificar que Ecwid esté disponible
      if (typeof Ecwid === 'undefined') {
        window.MushkanaSizeSelectorInitialized = false;
        setTimeout(init, 500);
        return;
      }
  
      // 1. Esperar a que Ecwid esté completamente cargado
      Ecwid.OnAPILoaded.add(function() {
        // Inicializar observer para productos dinámicos
        startObservingProducts();
      });
  
      // 2. Listener para cambios de página - SOLO HOME
      Ecwid.OnPageLoaded.add(function(page) {
        if (page.type === 'SITE') {
          // Esperar a que la página esté completamente renderizada
          requestAnimationFrame(() => {
            setTimeout(() => {
              processAllProducts();
            }, 300);
          });
        }
      });
  
      // 3. Procesar productos iniciales de forma segura
      if (document.readyState === 'complete') {
        // DOM completamente cargado
        requestAnimationFrame(() => {
          setTimeout(() => {
            processAllProducts();
          }, 800);
        });
      }
    }
  
    // Inicialización segura sin duplicaciones
    if (typeof Ecwid !== 'undefined') {
      // Ecwid ya está disponible
      init();
    } else {
      // Esperar a que Ecwid se cargue
      window.ecwid_script_defer = true;
      window.ecwid_dynamic_widgets = true;
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    }
  
  
  
    window.MushkanaSizeSelector = {
      clearCache: () => {
        Cache.clear();
        log('🧹 Caché limpiado manualmente');
      },
      getCacheStats: () => {
        return Cache.getStats();
      },
      reprocessAll: () => {
        log('🔄 Reprocesando todos los productos manualmente...');
        cleanupPreviousSelectors();
        processAllProducts();
      },
      getProcessedCount: () => {
        return document.querySelectorAll('[data-size-selector-processed]').length;
      },
      getTotalProducts: () => {
        const homeProducts = document.querySelectorAll('.ins-component__item').length;
        return homeProducts;
      },
      removeDuplicates: () => {
        const products = document.querySelectorAll('.ins-component__item');
        let duplicatesRemoved = 0;
        
        products.forEach(product => {
          const selectors = product.querySelectorAll('.mushkana-size-selector');
          if (selectors.length > 1) {
            // Mantener solo el primero, eliminar los demás
            for (let i = 1; i < selectors.length; i++) {
              selectors[i].remove();
              duplicatesRemoved++;
            }
          }
        });
        
        return duplicatesRemoved;
      },
    };
  
    log('📜 Script cargado');
  })();