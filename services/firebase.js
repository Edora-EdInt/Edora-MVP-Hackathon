import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyAAZjia-jnYHvzIADGkISYUjreoSqT_iwE",
  authDomain: "edora-mvp.firebaseapp.com",
  projectId: "edora-mvp",
  storageBucket: "edora-mvp.firebasestorage.app",
  messagingSenderId: "343578521659",
  appId: "1:343578521659:web:77a8a9e9b6f22e5972ec1e",
  measurementId: "G-RY4RT8Q034"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

window.__firebaseApp = app;
window.__firebaseAnalytics = analytics;

console.log('Firebase Connected Successfully');
