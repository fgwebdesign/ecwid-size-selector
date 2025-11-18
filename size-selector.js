/**
 * Size Selector for Ecwid - Mushkana
 * Custom App para mostrar variaciones de tallas en TODAS las páginas
 * 
 * Características:
 * - Funciona en HOME, CATEGORÍAS, BÚSQUEDA y todas las páginas
 * - Procesamiento en lotes para optimizar performance de API
 * - Cache inteligente en localStorage (12 horas)
 * - Observer universal para productos cargados dinámicamente
 * - Sin conflictos de hidratación con Ecwid
 * - Retry automático para rate limiting (429)
 * - Detección inteligente de IDs de productos
 * 
 * @version 3.0.0
 * @author Mushkana Team
 */

(function() {
    'use strict';
    
    const CONFIG = {
      storeId: 20337891,
      publicToken: 'public_2BPv8L5xZC2D98Vuu2SP6Ex352hHVZcV',
      secretToken: 'secret_yxFDL1jwygReLttrhrKXKePhxhusdJFp', // Solo para referencia, no usar en frontend
      apiUrl: 'https://app.ecwid.com/api/v3',
      sizeOptionName: 'Talle',
      debug: false, 
      
      cache: {
        enabled: true,
        expirationHours: 12,
        storageKey: 'mushkana_size_cache' 
      },
      
      // Selectores universales para productos en todas las páginas
      selectors: {
        // Contenedores de productos (home, categorías, búsqueda, etc.)
        productContainers: [
          '.grid-products',                  // Grid principal de productos (Mushkana)
          '.grid-products__items',           // Items del grid
          '.ins-component__items',           // Home y categorías (legacy)
          '.ecwid-productsGrid',             // Grid de productos (legacy)
          '.ecwid-productBrowser',           // Navegador de productos (legacy)
          '.ecwid-productBrowser-productsGrid', // Grid del navegador (legacy)
          '[data-ecwid-product-id]',         // Productos con data attribute
          '.ecwid-product'                   // Productos individuales (legacy)
        ],
        // Cards de productos individuales
        productCards: [
          '.grid-product',                   // Cards principales (Mushkana) - PRIORITARIO
          '.grid-product__wrap',             // Wrap de la card (Mushkana)
          '.ins-component__item',            // Cards del home/categorías (legacy)
          '.ecwid-productBrowser-productsGrid-item', // Items del grid (legacy)
          '.ecwid-productsGrid-item',        // Items del grid alternativo (legacy)
          '[data-ecwid-product-id]',         // Productos con data attribute
          '.ecwid-product'                   // Productos genéricos (legacy)
        ],
        // Elementos de precio (para insertar después)
        priceElements: [
          '.grid-product__price',            // Precio en grid-product (Mushkana) - PRIORITARIO
          '.ins-component__price',           // Precio en home/categorías (legacy)
          '.ecwid-productBrowser-price',     // Precio en navegador (legacy)
          '.ecwid-productsGrid-price',       // Precio en grid (legacy)
          '.ecwid-productBrowser-productsGrid-item-price', // Precio en item (legacy)
          '.ecwid-price'                     // Precio genérico (legacy)
        ]
      },
      
      styles: {
        hoverBorderColor: '#4ecdc4' // Color turquesa
      }
    };
  
    const log = (...args) => {
      if (CONFIG.debug) console.log('[SizeSelector]', ...args);
    };
  
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
  
    /**
     * Obtiene las variaciones del producto usando la JS API de Ecwid
     * Esta es la forma correcta de obtener datos desde el storefront
     */
    async function getProductVariationsFromJSAPI(productId) {
      return new Promise((resolve) => {
        if (typeof Ecwid === 'undefined' || !Ecwid.getProduct) {
          log('⚠️ Ecwid JS API no disponible');
          resolve(null);
          return;
        }

        try {
          Ecwid.getProduct(productId, (product) => {
            if (!product || !product.options) {
              resolve(null);
              return;
            }

            // Buscar la opción de talla
            const sizeOption = product.options.find(opt => 
              opt.name === CONFIG.sizeOptionName || 
              opt.name === 'Talle' || 
              opt.name === 'Talla' ||
              opt.name === 'Size' ||
              opt.name.toLowerCase() === 'talle' ||
              opt.name.toLowerCase() === 'talla' ||
              opt.name.toLowerCase() === 'size'
            );

            if (!sizeOption || !sizeOption.choices) {
              resolve(null);
              return;
            }

            // Construir variaciones desde las opciones
            const variations = [];
            if (product.combinations && product.combinations.length > 0) {
              // Si hay combinaciones definidas, usarlas
              product.combinations.forEach(combo => {
                const sizeChoice = combo.options?.find(opt => 
                  opt.name === CONFIG.sizeOptionName || 
                  opt.name === 'Talle' || 
                  opt.name === 'Talla' ||
                  opt.name === 'Size'
                );
                
                if (sizeChoice) {
                  variations.push({
                    id: combo.id,
                    options: [sizeChoice],
                    inStock: combo.inStock !== false,
                    unlimited: combo.unlimited || false,
                    sku: combo.sku,
                    price: combo.price || product.price
                  });
                }
              });
            } else {
              // Si no hay combinaciones, crear desde las opciones disponibles
              sizeOption.choices.forEach(choice => {
                variations.push({
                  id: null, // Se generará al seleccionar
                  options: [{
                    name: sizeOption.name,
                    value: choice.text || choice.title
                  }],
                  inStock: true, // Asumir disponible si no hay info
                  unlimited: true,
                  sku: null,
                  price: product.price
                });
              });
            }

            resolve(variations.length > 0 ? variations : null);
          });
        } catch (error) {
          log(`❌ Error usando Ecwid JS API para producto ${productId}:`, error);
          resolve(null);
        }
      });
    }

    /**
     * Obtiene las variaciones usando el endpoint proxy en Vercel
     * El proxy usa el secret token de forma segura en el servidor
     */
    async function getProductVariationsFromProxy(productId, retryCount = 0) {
      try {
        // Usar el endpoint proxy en Vercel
        const proxyUrl = 'https://ecwid-size-selector.vercel.app/api/combinations';
        const url = `${proxyUrl}?productId=${productId}`;
        
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
  
        if (!response.ok) {
          if (response.status === 429 && retryCount < 3) {
            // Rate limiting - esperar y reintentar
            const delay = (retryCount + 1) * 2000;
            log(`⏳ Rate limit alcanzado, reintentando en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getProductVariationsFromProxy(productId, retryCount + 1);
          }
          
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || ''}`);
        }
  
        const variations = await response.json();
        return variations;
      } catch (error) {
        log(`❌ Error obteniendo variaciones vía proxy para producto ${productId}:`, error);
        if (retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return getProductVariationsFromProxy(productId, retryCount + 1);
        }
        return null;
      }
    }

    /**
     * Obtiene las variaciones usando REST API directamente (fallback)
     * NOTA: El endpoint /combinations requiere autenticación de servidor
     * Este método probablemente fallará con 403, pero lo dejamos como fallback
     */
    async function getProductVariationsFromAPI(productId, retryCount = 0) {
      try {
        const url = `${CONFIG.apiUrl}/${CONFIG.storeId}/products/${productId}/combinations`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${CONFIG.publicToken}`,
            'Content-Type': 'application/json'
          }
        });
  
        if (!response.ok) {
          if (response.status === 403) {
            log(`⚠️ 403 Forbidden: El public token no tiene permisos para /combinations.`);
            return null;
          }
          
          if (response.status === 429 && retryCount < 3) {
            const delay = (retryCount + 1) * 2000;
            log(`⏳ Rate limit alcanzado, reintentando en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getProductVariationsFromAPI(productId, retryCount + 1);
          }
          
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const variations = await response.json();
        return variations;
      } catch (error) {
        log(`❌ Error obteniendo variaciones vía API para producto ${productId}:`, error);
        if (retryCount < 2 && !error.message.includes('403')) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return getProductVariationsFromAPI(productId, retryCount + 1);
        }
        return null;
      }
    }

    /**
     * Función principal para obtener variaciones
     * Intenta primero con JS API, luego con REST API
     */
    async function getProductVariations(productId, retryCount = 0) {
      const cached = Cache.get(productId);
      if (cached) {
        log(`📦 Usando caché para producto ${productId}`);
        return cached;
      }
  
      // Método 1: Intentar con JS API de Ecwid (recomendado para storefront)
      if (typeof Ecwid !== 'undefined') {
        log(`🔍 Intentando obtener variaciones vía JS API para producto ${productId}`);
        const jsApiResult = await getProductVariationsFromJSAPI(productId);
        if (jsApiResult && jsApiResult.length > 0) {
          Cache.set(productId, jsApiResult);
          return jsApiResult;
        }
      }

      // Método 2: Usar endpoint proxy en Vercel (usa secret token de forma segura)
      log(`🔍 Intentando obtener variaciones vía proxy para producto ${productId}`);
      const proxyResult = await getProductVariationsFromProxy(productId, retryCount);
      if (proxyResult && proxyResult.length > 0) {
        Cache.set(productId, proxyResult);
        return proxyResult;
      }

      // Método 3: Fallback a REST API directa con public token (probablemente fallará con 403)
      log(`🔍 Intentando obtener variaciones vía REST API directa para producto ${productId}`);
      const apiResult = await getProductVariationsFromAPI(productId, retryCount);
      if (apiResult && apiResult.length > 0) {
        Cache.set(productId, apiResult);
        return apiResult;
      }

      log(`⚠️ No se pudieron obtener variaciones para producto ${productId}`);
      return [];
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
          // Buscar la opción de talla - puede venir como 'name' o dentro de un array
          const sizeOption = variation.options?.find(
            opt => {
              const optName = opt.name || opt.nameTranslated?.es_419 || opt.nameTranslated?.es || '';
              return optName === CONFIG.sizeOptionName || 
                     optName === 'Size' || 
                     optName === 'Talla' ||
                     optName === 'Talle' ||
                     optName === 'TALLE' ||
                     optName === 'TALLES' ||
                     optName === 'Talles' ||
                     optName.toLowerCase() === 'size' ||
                     optName.toLowerCase() === 'talle' ||
                     optName.toLowerCase() === 'talla' ||
                     optName.toLowerCase() === 'talles';
            }
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
          // AGOTADO: Mostrar talle con "×" roja
          button.innerHTML = `<span class="mushkana-size-text">${size.value}</span><span class="mushkana-size-x">×</span>`;
          button.classList.add('mushkana-size-button--out-of-stock');
          button.disabled = true;
          button.title = `Talla ${size.value} - Agotado`;
        } else {
          // DISPONIBLE: Configurar título y eventos
          button.title = `Seleccionar talla ${size.value}`;
          
          // Click handler - Universal: Buscar link del producto de múltiples formas
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Buscar link del producto de múltiples formas
            let productLink = null;
            
            // Método 1: Buscar por ID del producto (Mushkana - grid-product)
            const productElement = document.querySelector(`.grid-product--id-${productId}, [data-product-id="${productId}"]`) ||
                                  document.querySelector(`#product-${productId}, [data-ecwid-product-id="${productId}"]`);
            if (productElement) {
              // Buscar en la estructura de grid-product
              productLink = productElement.querySelector('.grid-product__image') ||
                           productElement.querySelector('.grid-product__title') ||
                           productElement.querySelector('a[href*="/products/"]') ||
                           productElement.querySelector('a[href*="/p/"]') || 
                           productElement.querySelector('a[href*="productId"]') ||
                           productElement.closest('a');
            }
            
            // Método 2: Buscar link directo con Ecwid JS API
            if (!productLink && typeof Ecwid !== 'undefined' && Ecwid.getProduct) {
              try {
                const productUrl = Ecwid.getProduct(productId);
                if (productUrl) {
                  window.location.href = `${productUrl}?variation=${size.variationId}`;
                  return;
                }
              } catch (e) {
                log('Error usando Ecwid.getProduct:', e);
              }
            }
            
            // Método 3: Construir URL manualmente (fallback)
            if (!productLink) {
              const baseUrl = window.location.origin;
              window.location.href = `${baseUrl}/p/${productId}?variation=${size.variationId}`;
              return;
            }
            
            // Método 4: Usar el link encontrado
            if (productLink) {
              const baseUrl = productLink.href.split('?')[0].split('#')[0];
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
  
    /**
     * Extrae el ID del producto de múltiples formas para funcionar en todas las páginas
     */
    function extractProductId(productElement) {
      // Método 1: Data attribute data-product-id (Mushkana - grid-product__wrap)
      if (productElement.dataset.productId) {
        return productElement.dataset.productId;
      }
      
      // Método 2: Buscar .grid-product__wrap con data-product-id (Mushkana)
      const gridWrap = productElement.querySelector('.grid-product__wrap');
      if (gridWrap && gridWrap.dataset.productId) {
        return gridWrap.dataset.productId;
      }
      
      // Método 3: Buscar cualquier elemento con data-product-id dentro
      const dataAttrElement = productElement.querySelector('[data-product-id]');
      if (dataAttrElement && dataAttrElement.dataset.productId) {
        return dataAttrElement.dataset.productId;
      }
      
      // Método 4: ID en formato "product-XXXXXX" (home legacy)
      if (productElement.id && productElement.id.startsWith('product-')) {
        return productElement.id.replace('product-', '');
      }
      
      // Método 5: Data attribute data-ecwid-product-id (legacy)
      if (productElement.dataset.ecwidProductId) {
        return productElement.dataset.ecwidProductId;
      }
      
      // Método 6: Buscar en elementos hijos (legacy)
      const ecwidDataAttr = productElement.querySelector('[data-ecwid-product-id]');
      if (ecwidDataAttr) {
        return ecwidDataAttr.dataset.ecwidProductId;
      }
      
      // Método 7: Extraer del link del producto
      const productLink = productElement.querySelector('a[href*="/p/"]') || 
                         productElement.querySelector('a[href*="productId"]') ||
                         productElement.querySelector('a[href*="/products/"]');
      if (productLink) {
        const href = productLink.href;
        // Buscar patrón /p/XXXXXX, /products/...-pXXXXXX, o productId=XXXXXX
        const match = href.match(/\/p\/(\d+)/) || 
                     href.match(/-p(\d+)/) ||
                     href.match(/productId[=:](\d+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
      
      // Método 8: Buscar en el elemento padre
      const parent = productElement.closest('[data-product-id], [data-ecwid-product-id]');
      if (parent) {
        return parent.dataset.productId || parent.dataset.ecwidProductId;
      }
      
      return null;
    }
  
    /**
     * Encuentra el elemento de precio para insertar el selector después
     */
    function findPriceElement(productElement) {
      for (const selector of CONFIG.selectors.priceElements) {
        const priceElement = productElement.querySelector(selector);
        if (priceElement) {
          return priceElement;
        }
      }
      
      // Fallback: buscar cualquier elemento con clase que contenga "price"
      return productElement.querySelector('[class*="price"]');
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
        log('⚠️ No se pudo extraer el ID del producto');
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
  
      // Insertar después del precio usando requestAnimationFrame para evitar hidratación
      requestAnimationFrame(() => {
        const priceElement = findPriceElement(productElement);
        if (priceElement && !productElement.querySelector('.mushkana-size-selector')) {
          priceElement.insertAdjacentElement('afterend', sizeSelector);
          log(`✅ Selector agregado al producto ${productId}`);
        } else if (!priceElement) {
          // Fallback: insertar al final del contenedor del producto
          const productContent = productElement.querySelector('.grid-product__wrap-inner') ||  // Mushkana
                                productElement.querySelector('.ins-component__item-wrap-inner') ||  // Legacy
                                productElement.querySelector('.ecwid-productBrowser-productsGrid-item-content') ||  // Legacy
                                productElement.querySelector('.grid-product__wrap') ||  // Mushkana wrap
                                productElement;
          if (productContent && !productElement.querySelector('.mushkana-size-selector')) {
            productContent.appendChild(sizeSelector);
            log(`✅ Selector agregado al producto ${productId} (fallback)`);
          }
        }
      });
    }
  
    let isProcessing = false;
    let processingTimeout = null;
    
    /**
     * Obtiene todos los productos visibles en la página (universal)
     */
    function getAllProductCards() {
      const allProducts = new Set();
      
      // Buscar productos usando todos los selectores posibles
      for (const selector of CONFIG.selectors.productCards) {
        try {
          const products = document.querySelectorAll(`${selector}:not([data-size-selector-processed="true"])`);
          products.forEach(product => allProducts.add(product));
        } catch (e) {
          log(`⚠️ Error con selector ${selector}:`, e);
        }
      }
      
      return Array.from(allProducts);
    }
    
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
        
        // Obtener TODOS los productos visibles (no solo home)
        const allProducts = getAllProductCards();
        
        if (allProducts.length === 0) {
          isProcessing = false;
          return;
        }
  
        log(`🔄 Procesando ${allProducts.length} productos...`);
  
        // Procesar productos en lotes para evitar saturar la API
        const batchSize = 5; // Procesar 5 productos a la vez
        const batches = [];
        
        for (let i = 0; i < allProducts.length; i += batchSize) {
          batches.push(allProducts.slice(i, i + batchSize));
        }
  
        // Procesar cada lote secuencialmente
        for (const batch of batches) {
          const promises = batch.map(async (productElement) => {
            try {
              const productId = extractProductId(productElement);
              if (!productId) return;
              
              await processProduct(productElement);
            } catch (error) {
              log('❌ Error procesando producto:', error);
              // NO fallar toda la cadena, continuar con los demás
            }
          });
  
          // Esperar a que el lote se complete antes del siguiente
          await Promise.allSettled(promises);
          
          // Pequeña pausa entre lotes para no saturar la API
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        log(`✅ Procesamiento completado`);
      } finally {
        isProcessing = false;
        processingTimeout = null;
      }
    }
  
    function cleanupPreviousSelectors() {
      // Limpiar solo los duplicados, no todos los selectores
      const allProducts = getAllProductCards();
      
      allProducts.forEach(product => {
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
    // OBSERVADOR DE PRODUCTOS DINÁMICOS (UNIVERSAL)
    // ============================================
  
    let productObserver = null;
    let processingQueue = new Set();
    let debounceTimer = null;
  
    async function processQueue() {
      if (processingQueue.size === 0) return;
      
      const productsToProcess = Array.from(processingQueue);
      processingQueue.clear();
  
      log(`📦 Procesando cola de ${productsToProcess.length} productos...`);
  
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
          log('❌ Error procesando producto de la cola:', error);
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
  
      // Configurar el MutationObserver para observar TODO el DOM
      // Esto permite detectar productos en cualquier página
      productObserver = new MutationObserver((mutations) => {
        let newProductsFound = false;
  
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            // Solo elementos del DOM
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            
            // Verificar si es un producto usando todos los selectores
            let isProduct = false;
            for (const selector of CONFIG.selectors.productCards) {
              if (node.matches && node.matches(selector)) {
                isProduct = true;
                break;
              }
            }
            
            if (isProduct) {
              // Solo agregar si NO ha sido procesado
              if (node.dataset.sizeSelectorProcessed !== 'true') {
                processingQueue.add(node);
                newProductsFound = true;
              }
            } else if (node.querySelectorAll) {
              // Buscar productos dentro del nodo agregado
              for (const selector of CONFIG.selectors.productCards) {
                try {
                  const products = node.querySelectorAll(`${selector}:not([data-size-selector-processed="true"])`);
                  
                  if (products.length > 0) {
                    products.forEach(productElement => {
                      processingQueue.add(productElement);
                    });
                    newProductsFound = true;
                  }
                } catch (e) {
                  // Ignorar errores de selector inválido
                }
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
  
      // Observar TODO el body para capturar productos en cualquier página
      productObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false, // No observar cambios de atributos
        characterData: false // No observar cambios de texto
      });
      
      log('👀 Observer iniciado (observando todo el DOM)');
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
        log('✅ Ecwid API cargada');
        // Inicializar observer para productos dinámicos
        startObservingProducts();
      });
  
      // 2. Listener para cambios de página - TODAS las páginas
      Ecwid.OnPageLoaded.add(function(page) {
        log(`📄 Página cargada: ${page.type}`);
        // Procesar en TODAS las páginas, no solo SITE
        requestAnimationFrame(() => {
          setTimeout(() => {
            processAllProducts();
          }, 300);
        });
      });
  
      // 3. Procesar productos iniciales de forma segura
      if (document.readyState === 'complete') {
        // DOM completamente cargado
        requestAnimationFrame(() => {
          setTimeout(() => {
            processAllProducts();
          }, 800);
        });
      } else {
        // Esperar a que el DOM esté listo
        document.addEventListener('DOMContentLoaded', () => {
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
  
    // ============================================
    // API PÚBLICA
    // ============================================
  
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
        // Resetear el flag de procesado para todos los productos
        document.querySelectorAll('[data-size-selector-processed]').forEach(el => {
          el.dataset.sizeSelectorProcessed = 'false';
        });
        cleanupPreviousSelectors();
        processAllProducts();
      },
      getProcessedCount: () => {
        return document.querySelectorAll('[data-size-selector-processed="true"]').length;
      },
      getTotalProducts: () => {
        return getAllProductCards().length;
      },
      removeDuplicates: () => {
        const allProducts = getAllProductCards();
        let duplicatesRemoved = 0;
        
        allProducts.forEach(product => {
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
      enableDebug: () => {
        CONFIG.debug = true;
        log('🐛 Modo debug activado');
      },
      disableDebug: () => {
        CONFIG.debug = false;
        log('🐛 Modo debug desactivado');
      }
    };
  
    log('📜 Script cargado - Versión 3.0.0 (Universal)');
  })();
