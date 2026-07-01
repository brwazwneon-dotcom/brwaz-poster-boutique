/* Firebase Cloud Messaging service worker. Loaded lazily by admin dashboard. */
/* global importScripts, firebase, self, clients */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

let initialized = false;
function initFromConfig(config) {
  if (initialized || !config) return;
  try {
    firebase.initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = (payload.notification && payload.notification.title) ||
        (payload.data && payload.data.title) || "New Order";
      const body = (payload.notification && payload.notification.body) ||
        (payload.data && payload.data.body) || "";
      const orderId = payload.data && payload.data.order_id;
      self.registration.showNotification(title, {
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: orderId ? `order-${orderId}` : "brw-order",
        data: { url: "/admin?tab=orders" + (orderId ? "&order=" + orderId : ""), ...(payload.data || {}) },
      });
    });
    initialized = true;
  } catch (e) {
    // swallow — will retry on next config message
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG") {
    initFromConfig(event.data.config);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin?tab=orders";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes("/admin")) {
          w.focus();
          w.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));