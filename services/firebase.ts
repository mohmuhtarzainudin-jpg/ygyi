
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence, collection, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAcBb_MQo7Iy6vUAkAoduApWvnmF5aA-8Q",
  authDomain: "poszyra-1e546.firebaseapp.com",
  projectId: "poszyra-1e546",
  storageBucket: "poszyra-1e546.firebasestorage.app",
  messagingSenderId: "296361584594",
  appId: "1:296361584594:web:4dd317fbf9a0434a0fca0b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
  } else if (err.code == 'unimplemented') {
      console.warn("The current browser does not support all of the features required to enable persistence");
  }
});

// Helper to initialize a new store if it doesn't exist
export const initializeStore = async (storeId: string) => {
  try {
    const storeRef = doc(db, 'stores', storeId);
    const snap = await getDoc(storeRef);
    
    // 1. Create Store Metadata if missing
    if (!snap.exists()) {
      await setDoc(storeRef, {
        storeId,
        name: "Zyra Billiard Dan Kopi",
        createdAt: Date.now()
      });
      
      // Create default tables only for new stores
      for(let i = 1; i <= 7; i++) {
          await setDoc(doc(db, `stores/${storeId}/tables`, `table-${i}`), {
              name: `Meja ${i}`,
              status: 'available',
              costPerHour: 20000,
              remoteUrl: ''
          });
      }
    }

    // 2. Ensure Users Exist (Run this check even for existing stores to fix missing roles)
    // Check/Create Admin
    const adminRef = doc(db, `stores/${storeId}/users`, 'admin');
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        name: 'Owner',
        pin: '123456',
        role: 'admin'
      });
    }

    // Check/Create Cashier
    const cashierRef = doc(db, `stores/${storeId}/users`, 'cashier-1');
    const cashierSnap = await getDoc(cashierRef);
    if (!cashierSnap.exists()) {
      await setDoc(cashierRef, {
        name: 'Kasir',
        pin: '11223344',
        role: 'cashier'
      });
    }

  } catch (error: any) {
    console.error("Firebase Initialization Error:", error);
    // Re-throw specific errors for the UI to handle
    if (error.code === 'permission-denied') {
      throw new Error("Akses Ditolak. Pastikan 'Firestore Database' sudah dibuat di Firebase Console dan Rules diatur ke 'Test Mode'.");
    } else if (error.code === 'unavailable') {
      throw new Error("Koneksi gagal. Periksa koneksi internet Anda.");
    } else if (error.code === 'not-found') {
        throw new Error("Project tidak ditemukan. Periksa konfigurasi Firebase.");
    } else {
      throw new Error(`Gagal menghubungkan: ${error.message}`);
    }
  }
};

export { db };