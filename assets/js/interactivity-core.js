/**
 * MzDocs Pro v3 - Interactivity Core
 * Production-grade PWA interactivity system
 * Handles iOS fixes, PWA compatibility, event delegation, and network timeouts
 */

/**
 * Device Detection Module
 * Feature-based device capability detection
 */
const Device = (() => {
  const isIOS = () => {
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && !window.MSStream;
  };

  const isStandalone = () => {
    return window.navigator.standalone === true || 
           window.matchMedia('(display-mode: standalone)').matches;
  };

  const isTouchDevice = () => {
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  };

  const supportsPassive = () => {
    let passive = false;
    const options = {
      get passive() {
        passive = true;
        return false;
      }
    };
    try {
      window.addEventListener('test', null, options);
      window.removeEventListener('test', null, options);
    } catch (e) {
      passive = false;
    }
    return passive;
  };

  const getViewportMeta = () => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes';
      document.head.appendChild(meta);
    }
    return meta;
  };

  return {
    isIOS,
    isStandalone,
    isTouchDevice,
    supportsPassive,
    getViewportMeta
  };
})();

/**
 * iOS Click Fix Module
 * Solves iOS Safari click event issues using touchend detection
 */
const IOSFix = (() => {
  let touchStarted = false;
  let lastTouchElement = null;
  const activeTouches = new Map();

  const init = () => {
    if (!Device.isIOS()) return;

    // Detect touch start to flag interactive elements
    document.addEventListener('touchstart', handleTouchStart, Device.supportsPassive() ? { passive: true } : false);
    document.addEventListener('touchend', handleTouchEnd, false);
    document.addEventListener('touchcancel', handleTouchCancel, Device.supportsPassive() ? { passive: true } : false);
    
    // Prevent ghost clicks
    document.addEventListener('click', preventGhostClick, true);
  };

  const handleTouchStart = (e) => {
    touchStarted = true;
    lastTouchElement = e.target;
    const touch = e.touches[0];
    if (touch) {
      activeTouches.set(e.identifier || 'primary', {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      });
    }
  };

  const handleTouchEnd = (e) => {
    touchStarted = false;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const target = e.target;
    const clickableElement = findClickableElement(target);
    
    if (clickableElement) {
      // Simulate click with proper context
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      clickableElement.dispatchEvent(clickEvent);
    }
  };

  const handleTouchCancel = (e) => {
    touchStarted = false;
    activeTouches.clear();
  };

  const preventGhostClick = (e) => {
    const timeDiff = Date.now() - getLastTouchTime();
    
    // Block clicks within 300ms of touch (ghost click prevention)
    if (timeDiff < 300 && lastTouchElement) {
      const clicked = e.target;
      if (isDescendantOf(clicked, lastTouchElement) || clicked === lastTouchElement) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  };

  const findClickableElement = (element) => {
    let current = element;
    const clickableSelectors = ['button', 'a', '[role="button"]', 'input[type="submit"]', 'input[type="checkbox"]', 'input[type="radio"]'];
    
    while (current && current !== document.body) {
      for (let selector of clickableSelectors) {
        if (current.matches(selector)) return current;
      }
      if (current.onclick || current.getAttribute('data-clickable')) {
        return current;
      }
      current = current.parentElement;
    }
    return element;
  };

  const isDescendantOf = (child, parent) => {
    let current = child;
    while (current) {
      if (current === parent) return true;
      current = current.parentElement;
    }
    return false;
  };

  const getLastTouchTime = () => {
    let lastTime = 0;
    activeTouches.forEach(touch => {
      if (touch.time > lastTime) lastTime = touch.time;
    });
    return lastTime;
  };

  return { init };
})();

/**
 * Event Delegation Module
 * Handles event delegation for dynamic DOM elements
 */
const EventFix = (() => {
  const delegatedEvents = new Map();

  const init = () => {
    // Use capture phase for better delegation
    document.addEventListener('click', handleDelegatedClick, true);
    document.addEventListener('change', handleDelegatedChange, true);
    document.addEventListener('input', handleDelegatedInput, true);
  };

  const on = (selector, event, handler) => {
    const key = `${selector}:${event}`;
    if (!delegatedEvents.has(key)) {
      delegatedEvents.set(key, []);
    }
    delegatedEvents.get(key).push(handler);
  };

  const off = (selector, event, handler) => {
    const key = `${selector}:${event}`;
    if (delegatedEvents.has(key)) {
      const handlers = delegatedEvents.get(key);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  };

  const handleDelegatedClick = (e) => {
    matchAndTrigger(e, 'click');
  };

  const handleDelegatedChange = (e) => {
    matchAndTrigger(e, 'change');
  };

  const handleDelegatedInput = (e) => {
    matchAndTrigger(e, 'input');
  };

  const matchAndTrigger = (e, eventType) => {
    let current = e.target;
    
    while (current && current !== document.body) {
      delegatedEvents.forEach((handlers, key) => {
        const [selector, type] = key.split(':');
        if (type === eventType && current.matches(selector)) {
          handlers.forEach(handler => {
            handler.call(current, e);
          });
        }
      });
      current = current.parentElement;
    }
  };

  const clear = () => {
    delegatedEvents.clear();
  };

  return { init, on, off, clear };
})();

/**
 * PWA Fix Module
 * Handles PWA standalone mode and service worker updates
 */
const PWAFix = (() => {
  let swRegistration = null;

  const init = async () => {
    setupViewportForStandalone();
    setupStandaloneDetection();
    
    if ('serviceWorker' in navigator) {
      await registerServiceWorker();
      watchForUpdates();
    }
  };

  const setupViewportForStandalone = () => {
    const viewport = Device.getViewportMeta();
    if (Device.isStandalone()) {
      viewport.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no';
    }
  };

  const setupStandaloneDetection = () => {
    const handleStandaloneChange = (e) => {
      if (e.matches) {
        document.documentElement.setAttribute('data-pwa-standalone', 'true');
        adjustPathForStandalone();
      } else {
        document.documentElement.removeAttribute('data-pwa-standalone');
      }
    };

    const mql = window.matchMedia('(display-mode: standalone)');
    mql.addListener(handleStandaloneChange);
    handleStandaloneChange(mql);
  };

  const adjustPathForStandalone = () => {
    const baseUrl = new URL(document.baseURI);
    if (baseUrl.pathname !== '/') {
      const base = document.querySelector('base') || document.createElement('base');
      base.href = baseUrl.href;
      if (!document.querySelector('base')) {
        document.head.insertBefore(base, document.head.firstChild);
      }
    }
  };

  const registerServiceWorker = async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      // Handle controller change (service worker update)
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      return swRegistration;
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  };

  const handleControllerChange = () => {
    // Service worker has been updated and activated
    const event = new CustomEvent('pwa-update', {
      detail: { type: 'controller-change' }
    });
    window.dispatchEvent(event);
  };

  const watchForUpdates = () => {
    if (!swRegistration) return;

    // Check for updates periodically
    setInterval(() => {
      swRegistration.update().catch(err => {
        console.warn('SW update check failed:', err);
      });
    }, 60000); // Check every minute
  };

  const notifyUserOfUpdate = () => {
    const event = new CustomEvent('pwa-update-ready', {
      detail: { message: 'New version available' }
    });
    window.dispatchEvent(event);
  };

  return { init };
})();

/**
 * Network Timeout Module
 * Wraps fetch with timeout and retry logic
 */
const NetworkTimeout = (() => {
  const DEFAULT_TIMEOUT = 10000; // 10 seconds
  const DEFAULT_RETRIES = 3;

  const fetchWithTimeout = async (url, options = {}) => {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const retries = options.retries !== undefined ? options.retries : DEFAULT_RETRIES;
    
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok && attempt < retries) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          lastError = new Error(`Network timeout after ${timeout}ms`);
        }

        if (attempt < retries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error('Fetch failed after retries');
  };

  const get = (url, options = {}) => {
    return fetchWithTimeout(url, { ...options, method: 'GET' });
  };

  const post = (url, data, options = {}) => {
    return fetchWithTimeout(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  };

  const put = (url, data, options = {}) => {
    return fetchWithTimeout(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  };

  const patch = (url, data, options = {}) => {
    return fetchWithTimeout(url, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: JSON.stringify(data)
    });
  };

  const del = (url, options = {}) => {
    return fetchWithTimeout(url, { ...options, method: 'DELETE' });
  };

  return {
    fetch: fetchWithTimeout,
    get,
    post,
    put,
    patch,
    delete: del
  };
})();

/**
 * Global Interactivity Initializer
 * Auto-initializes all modules on DOMContentLoaded
 */
const InteractivityCore = (() => {
  let initialized = false;

  const init = async () => {
    if (initialized) return;
    initialized = true;

    try {
      // Initialize all modules
      IOSFix.init();
      EventFix.init();
      await PWAFix.init();

      // Dispatch custom event for other scripts to hook into
      const event = new CustomEvent('interactivity-ready', {
        detail: {
          Device,
          IOSFix,
          EventFix,
          PWAFix,
          NetworkTimeout
        }
      });
      window.dispatchEvent(event);

      // Mark document as ready
      document.documentElement.setAttribute('data-interactivity-ready', 'true');
    } catch (error) {
      console.error('Interactivity Core initialization failed:', error);
    }
  };

  const ready = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  };

  return {
    init,
    ready,
    Device,
    IOSFix,
    EventFix,
    PWAFix,
    NetworkTimeout
  };
})();

/**
 * Auto-initialize on DOM ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', InteractivityCore.init);
} else {
  InteractivityCore.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InteractivityCore;
}
