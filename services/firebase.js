import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js";

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
const db = getFirestore(app);
const storage = getStorage(app);

window.__firebaseApp = app;
window.__firebaseAnalytics = analytics;
window.__firebaseDb = db;
window.__firebaseStorage = storage;
window.__firestore = { collection, getDocs };

window.__uploadPhoto = async function(base64Data, examCode, attemptId, type) {
  try {
    var path = 'photo-verification/' + examCode + '/' + attemptId + '/' + type + '.jpg';
    console.log('[Photo] Upload started — path:', path, 'data length:', base64Data.length);
    var storageRef = ref(storage, path);
    var snapshot = await uploadString(storageRef, base64Data, 'data_url');
    console.log('[Photo] Upload successful — metadata:', snapshot.metadata ? 'exists' : 'none');
    var downloadUrl = await getDownloadURL(snapshot.ref);
    console.log('[Photo] URL generated —', downloadUrl);
    return downloadUrl;
  } catch(e) {
    console.error('[Photo] Upload failed:', e.message);
    return null;
  }
};

window.__saveExamToFirestore = async function(examData) {
  try {
    await setDoc(doc(db, "exams", examData.code), {
      name: examData.name,
      code: examData.code,
      subject: examData.subject,
      board: examData.board,
      class: examData.class,
      chapters: examData.chapters || [],
      startTime: examData.startTime,
      endTime: examData.endTime,
      duration: examData.duration,
      totalMarks: examData.totalMarks,
      id: examData.id || "",
      variantLabel: examData.variantLabel || "",
      paper: examData.paper,
      status: examData.status || "scheduled",
      publishedAt: examData.publishedAt || new Date().toISOString(),
      blueprint: examData.blueprint || null,
    });
    console.log("[Firestore] Exam saved successfully:", examData.code);
  } catch(e) {
    console.error("[Firestore] Save failed:", e.message);
  }
};

window.__getExamFromFirestore = async function(code) {
  try {
    var snap = await getDoc(doc(db, "exams", code));
    if (snap.exists()) {
      console.log("[Firestore] Exam retrieved successfully:", code);
      return snap.data();
    }
    console.log("[Firestore] Exam not found:", code);
    return null;
  } catch(e) {
    console.error("[Firestore] Retrieval failed:", e.message);
    return null;
  }
};

window.__saveSubmissionToFirestore = async function(submissionData) {
  try {
    var docRef = await addDoc(collection(db, "submissions"), submissionData);
    console.log("[Firestore] Submission saved:", docRef.id, "for exam:", submissionData.examCode);
  } catch(e) {
    console.error("[Firestore] Submission save failed:", e.message);
  }
};

console.log("Firebase Connected Successfully");
