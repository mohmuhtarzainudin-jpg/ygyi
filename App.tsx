import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Coffee, 
  Target, // Using Target as Billiard Icon alternative
  Settings, 
  Users, 
  LogOut, 
  Plus, 
  Minus, 
  Trash2, 
  Save, 
  Search,
  History,
  AlertTriangle,
  PlayCircle,
  StopCircle,
  ExternalLink,
  Edit,
  XCircle,
  Package,
  ChefHat,
  Receipt,
  FileText,
  Clock,
  BellRing,
  ClipboardCheck,
  ShoppingCart,
  ArrowRightLeft,
  Power,
  Wrench,
  Printer,
  UserCircle,
  Send,
  UserPlus,
  Store,
  Wifi,
  Instagram,
  Phone,
  Upload,
  Menu,
  X
} from 'lucide-react';
import { db, initializeStore } from './services/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc, 
  doc, 
  deleteDoc, 
  orderBy,
  getDoc,
  runTransaction,
  deleteField
} from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from 'recharts';
import { User, Product, Table, Transaction, CartItem, Variant, Ingredient, RecipeItem, Shift, Operator, StoreSettings } from './types';
import { BluetoothPrinter } from './components/BluetoothPrinter';

// --- Lamp control helpers ---
const LAMP_BASE_URL = 'http://192.168.100.120/led';

function TABLE_LAMP_URL(num: number, action: 'on' | 'off' | 'toggle' = 'toggle', durationSec?: number) {
  let u = `${LAMP_BASE_URL}?num=${num}&action=${action}`;
  if (durationSec && durationSec > 0) u += `&duration=${durationSec}`;
  return u;
}

// Control lamp with action: 'on' | 'off' | 'toggle', optionally with duration (seconds)
async function controlLamp(num: number, action: 'on' | 'off' | 'toggle' = 'toggle', durationSec?: number, timeout = 5000): Promise<{ ok: boolean; status?: number; text?: string; error?: string }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const url = TABLE_LAMP_URL(num, action, durationSec);
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', signal: controller.signal });
    clearTimeout(id);
    const text = await res.text().catch(() => undefined);
    return { ok: res.ok, status: res.status, text };
  } catch (err: any) {
    clearTimeout(id);
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : String(err) };
  }
}

// Use table-specific URLs if provided, else fallback to controlLamp using numeric endpoint
async function controlLampForTable(table: Table, action: 'on' | 'off' | 'toggle' = 'toggle', durationSec?: number) {
  try {
    // prefer explicit URLs configured per table
    let url: string | undefined;
    if (action === 'on' && table.remoteOn) url = table.remoteOn;
    else if (action === 'off' && table.remoteOff) url = table.remoteOff;
    else if (action === 'toggle' && table.remoteToggle) url = table.remoteToggle;

    if (url) {
      if (durationSec && durationSec > 0) {
        // append duration param if not present
        url += (url.includes('?') ? '&' : '?') + `duration=${durationSec}`;
      }
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, { method: 'GET', mode: 'cors', signal: controller.signal });
        clearTimeout(id);
        const text = await res.text().catch(() => undefined);
        return { ok: res.ok, status: res.status, text };
      } catch (err: any) {
        clearTimeout(id);
        return { ok: false, error: err.name === 'AbortError' ? 'timeout' : String(err) };
      }
    }

    // fallback: derive number and use default endpoint
    // try to infer number from name or tables ordering (best-effort)
    // Caller may pass table with name and rely on deriveTableNumber elsewhere
    const inferredNum = deriveTableNumber(table.name, 0);
    return controlLamp(inferredNum, action, durationSec);
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

// Derive table number from table name (e.g. "Meja 1") or fallback to index+1
function deriveTableNumber(tableName: string | undefined, index: number) {
  if (!tableName) return index + 1;
  const m = tableName.match(/(\d+)/);
  if (m) return Number(m[1]);
  return index + 1;
}

// --- Types & Constants ---
const STORE_KEY = 'zyra_store_id';
const SHIFT_KEY = 'zyra_active_shift';

// --- Helper Components ---

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}

const Modal: React.FC<ModalProps> = ({ children, onClose, title }) => (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
    <div className="bg-secondary rounded-xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-700 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 shrink-0">
        <h3 className="font-bold text-lg text-white truncate pr-4">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700">✕</button>
      </div>
      <div className="p-4 sm:p-6 overflow-y-auto">
        {children}
      </div>
    </div>
  </div>
);

// Simple Error Boundary to avoid full blank screen when modal render fails
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('ErrorBoundary caught', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Modal title="Error" onClose={() => { this.setState({ hasError: false, error: undefined }); }}>
          <div className="p-4">
            <p className="text-red-400">Terjadi kesalahan saat membuka modal. Cek console untuk detil.</p>
            <pre className="text-xs mt-2 text-slate-300">{String(this.state.error)}</pre>
          </div>
        </Modal>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

// --- Main App Component ---

const App: React.FC = () => {
    // User Management State
    const [newUserName, setNewUserName] = useState('');
    const [newUserPin, setNewUserPin] = useState('');
    const [newUserRole, setNewUserRole] = useState<Role>('cashier');
    const [editUser, setEditUser] = useState<User | null>(null);
    const [editUserName, setEditUserName] = useState('');
    const [editUserPin, setEditUserPin] = useState('');
    const [editUserRole, setEditUserRole] = useState<Role>('cashier');
    const [deleteUser, setDeleteUser] = useState<User | null>(null);

    useEffect(() => {
      if (editUser) {
        setEditUserName(editUser.name);
        setEditUserPin(editUser.pin);
        setEditUserRole(editUser.role);
      }
    }, [editUser]);

    const handleAddUser = async () => {
      if (!newUserName || !newUserPin) return alert('Nama dan PIN wajib diisi');
      try {
        const id = `user-${Date.now()}`;
        await setDoc(doc(db, `stores/${storeId}/users`, id), {
          name: newUserName,
          pin: newUserPin,
          role: newUserRole
        });
        setNewUserName('');
        setNewUserPin('');
        setNewUserRole('cashier');
      } catch (e) {
        console.error(e);
        alert('Gagal menambah akun');
      }
    };

    const handleEditUser = async () => {
      if (!editUser || !editUserName || !editUserPin) return alert('Nama dan PIN wajib diisi');
      try {
        await setDoc(doc(db, `stores/${storeId}/users`, editUser.id), {
          name: editUserName,
          pin: editUserPin,
          role: editUserRole
        });
        setEditUser(null);
      } catch (e) {
        console.error(e);
        alert('Gagal edit akun');
      }
    };

    const handleDeleteUser = async () => {
      if (!deleteUser) return;
      try {
        await deleteDoc(doc(db, `stores/${storeId}/users`, deleteUser.id));
        setDeleteUser(null);
      } catch (e) {
        console.error(e);
        alert('Gagal hapus akun');
      }
    };
  const [storeId, setStoreId] = useState<string | null>(localStorage.getItem(STORE_KEY));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'billiard' | 'cafe' | 'inventory' | 'settings' | 'history'>('dashboard');
  
  // Data State
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]); 

  // Shift State
  const [activeShift, setActiveShift] = useState<Shift | null>(() => {
    const saved = localStorage.getItem(SHIFT_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [showShiftModal, setShowShiftModal] = useState(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false); // Mobile Cart Drawer State

  // Login State
  const [inputPin, setInputPin] = useState('');
  const [inputStoreId, setInputStoreId] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // --- Real-time Sync ---

  useEffect(() => {
    if (!storeId) return;

    initializeStore(storeId).catch(err => console.error("Auto-init error:", err));

    const handleSnapshotError = (error: any) => {
      console.error("Sync Error:", error);
      if (error.code === 'permission-denied') {
        setConnectError("Izin Database Ditolak. Cek Firebase Console &gt; Rules.");
      }
    };

    const unsubProducts = onSnapshot(collection(db, `stores/${storeId}/products`), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, handleSnapshotError);

    const unsubIngredients = onSnapshot(collection(db, `stores/${storeId}/ingredients`), (snap) => {
      setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    }, handleSnapshotError);

    let prevTables: Table[] = [];
    const unsubTables = onSnapshot(query(collection(db, `stores/${storeId}/tables`), orderBy('name')), (snap) => {
      const latest = snap.docs.map(d => ({ id: d.id, ...d.data() } as Table));

      // Compare previous table statuses and control lamps on changes
      for (let i = 0; i < latest.length; i++) {
        const t = latest[i];
        const p = prevTables.find(x => x.id === t.id);
        const num = deriveTableNumber(t.name, i);
        if (!p) {
          if (t.status === 'occupied') {
            const dur = t.endTime ? Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000)) : undefined;
            controlLamp(num, 'on', dur).catch(e => console.warn('controlLamp error', e));
          }
        } else if (p.status !== t.status) {
          if (p.status !== 'occupied' && t.status === 'occupied') {
            const dur = t.endTime ? Math.max(0, Math.ceil((t.endTime - Date.now()) / 1000)) : undefined;
            controlLamp(num, 'on', dur).catch(e => console.warn('controlLamp error', e));
          } else if (p.status === 'occupied' && t.status !== 'occupied') {
            controlLamp(num, 'off').catch(e => console.warn('controlLamp error', e));
          }
        }
      }

      prevTables = latest;
      setTables(latest);
    }, handleSnapshotError);

    const unsubUsers = onSnapshot(collection(db, `stores/${storeId}/users`), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    }, handleSnapshotError);

    const unsubOperators = onSnapshot(collection(db, `stores/${storeId}/operators`), (snap) => {
       setOperators(snap.docs.map(d => ({ id: d.id, ...d.data() } as Operator)));
    }, handleSnapshotError);

    // Fetch transactions
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const qTrans = query(
      collection(db, `stores/${storeId}/transactions`), 
      where('date', '>', thirtyDaysAgo),
      orderBy('date', 'desc')
    );
    const unsubTrans = onSnapshot(qTrans, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, handleSnapshotError);

    return () => {
      unsubProducts();
      unsubIngredients();
      unsubTables();
      unsubUsers();
      unsubTrans();
      unsubOperators();
    };
  }, [storeId]);

  // Auto-stop tables when their endTime passes (runs locally where this app is active).
  // Warning: This will update Firestore to set table status to 'available' when timer expires.
  useEffect(() => {
    if (!storeId) return;
    const iv = setInterval(() => {
      const now = Date.now();
      tables.forEach(async (t) => {
        try {
          if (t.status === 'occupied' && t.endTime && now >= t.endTime) {
            // Mark table as available and clear timing fields
            await updateDoc(doc(db, `stores/${storeId}/tables`, t.id), {
              status: 'available',
              startTime: deleteField(),
              endTime: deleteField(),
              duration: 0,
              currentCustomer: deleteField()
            });
          }
        } catch (e) {
          console.warn('Auto-stop table failed', e);
        }
      });
    }, 15 * 1000); // check every 15s
    return () => clearInterval(iv);
  }, [tables, storeId]);

  // --- Handlers ---

  const addToCartProduct = (product: Product, price: number, variantType?: string) => {
    if (!product.isRecipe && product.stock <= 0) {
      alert("Stok Habis!");
      return;
    }

    setCart(prev => {
      // Check if exact item exists
      const existing = prev.find(item => 
        item.itemType === 'product' && 
        item.productId === product.id && 
        item.variantType === variantType
      );

      if (existing) {
        return prev.map(item => item === existing ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { 
        itemType: 'product',
        productId: product.id, 
        name: product.name + (variantType ? ` (${variantType})` : ''), 
        price: price, 
        quantity: 1,
        variantType,
        isRecipe: product.isRecipe
      }];
    });
  };

  const addToCartTable = (table: Table, duration: number) => {
    // Check if table is already in cart
    const exists = cart.find(item => item.itemType === 'table' && item.tableId === table.id);
    if (exists) {
      alert("Meja ini sudah ada di keranjang. Hapus dulu jika ingin mengubah durasi.");
      return;
    }
    
    const isTopup = table.status === 'occupied';
    const price = (duration / 60) * table.costPerHour;
    const itemName = isTopup 
      ? `Topup ${table.name} (+${duration} Menit)`
      : `Sewa ${table.name} (${duration} Menit)`;

    setCart(prev => [...prev, {
      itemType: 'table',
      tableId: table.id,
      name: itemName,
      price: price,
      quantity: 1,
      duration: duration
    }]);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
    if (cart.length <= 1) setShowMobileCart(false);
  };

  const handleStoreConnect = async () => {
    if (!inputStoreId) return;
    setLoading(true);
    setConnectError(null);
    try {
      await initializeStore(inputStoreId);
      localStorage.setItem(STORE_KEY, inputStoreId);
      setStoreId(inputStoreId);
    } catch (error: any) {
      setConnectError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    if (users.length === 0) {
      alert("Sedang memuat data user dari database... Mohon tunggu sebentar.");
      return;
    }

    const user = users.find(u => u.pin === inputPin);
    if (user) {
      setCurrentUser(user);
      setInputPin('');
      if (user.role === 'cashier') {
        setActiveTab('billiard');
        if (!activeShift) {
          setShowShiftModal(true);
        }
      } else {
        setActiveTab('dashboard');
      }
    } else {
      alert("PIN Salah atau User tidak ditemukan!");
      setInputPin('');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('dashboard');
    setCart([]);
    setShowMobileCart(false);
  };

  // Shift Management Handlers
  const handleStartShift = (name: string, cash: number) => {
    const newShift: Shift = {
      operatorName: name,
      startTime: Date.now(),
      startCash: cash
    };
    setActiveShift(newShift);
    localStorage.setItem(SHIFT_KEY, JSON.stringify(newShift));
    setShowShiftModal(false);
  };

  const handleEndShift = () => {
    localStorage.removeItem(SHIFT_KEY);
    setActiveShift(null);
  };

  // Cart Component (Reusable)
  const CartContent = () => (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
           <div className="text-center text-slate-500 mt-10 flex flex-col items-center gap-2">
             <ShoppingCart size={40} className="opacity-20"/>
             <p>Keranjang Kosong</p>
             <p className="text-xs">Klik meja atau produk untuk menambahkan</p>
           </div>
        ) : (
           cart.map((item, idx) => (
             <div key={idx} className="flex justify-between items-center bg-slate-800 p-3 rounded border border-slate-700/50 hover:border-slate-500 transition">
               <div>
                 <p className="font-medium text-white line-clamp-1">{item.name}</p>
                 <p className="text-sm text-slate-400">
                   {item.quantity} x Rp {item.price.toLocaleString()}
                 </p>
                 {item.isRecipe && <span className="text-[10px] text-orange-400 bg-orange-900/20 px-1 rounded">Racikan</span>}
                 {item.itemType === 'table' && <span className="text-[10px] text-blue-400 bg-blue-900/20 px-1 rounded ml-1">Sewa</span>}
               </div>
               <button onClick={() => removeFromCart(idx)} className="text-red-400 hover:text-red-300 p-2 hover:bg-red-900/20 rounded">
                 <Trash2 size={18} />
               </button>
             </div>
           ))
        )}
      </div>

      <div className="p-4 bg-slate-800 border-t border-slate-700">
        <div className="flex justify-between text-lg font-bold mb-4 text-white">
          <span>Total</span>
          <span>Rp {cart.reduce((acc, i) => acc + (i.price * i.quantity), 0).toLocaleString()}</span>
        </div>
        <button 
          onClick={() => { setShowMobileCart(false); setIsCheckoutOpen(true); }}
          disabled={cart.length === 0}
          className="w-full bg-accent hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-primary font-bold py-3 rounded-lg text-lg transition shadow-lg shadow-accent/20"
        >
          Bayar
        </button>
      </div>
    </>
  );

  // --- Screens Render ---

  if (!storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary p-4">
        <div className="bg-secondary p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-accent mb-2">Zyra POS</h1>
          <p className="text-slate-400 mb-6">Hubungkan perangkat ini ke database toko.</p>
          
          {connectError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm text-left">
              <strong>Gagal Terhubung:</strong>
              <p>{connectError}</p>
            </div>
          )}

          <input 
            type="text" 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-4 text-white placeholder-slate-500 focus:outline-none focus:border-accent uppercase"
            placeholder="Masukkan ID Toko (e.g. ZYRA01)"
            value={inputStoreId}
            onChange={(e) => setInputStoreId(e.target.value.toUpperCase())}
          />
          <button 
            onClick={handleStoreConnect}
            disabled={loading}
            className={`w-full bg-accent hover:bg-emerald-600 text-primary font-bold py-3 rounded-lg transition ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Menghubungkan...' : 'Hubungkan / Buat Baru'}
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary p-4">
        <div className="bg-secondary p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Login Operator</h1>
          <p className="text-slate-400 mb-6">Store ID: {storeId}</p>
          
          <div className="flex justify-center mb-6">
            <input 
              type="password" 
              className="text-center text-4xl tracking-[1em] bg-transparent border-b-2 border-slate-600 w-full focus:outline-none focus:border-accent text-white"
              value={inputPin}
              readOnly
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button 
                key={num} 
                onClick={() => setInputPin(prev => prev + num)}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xl font-bold py-4 rounded-lg active:bg-slate-600 active:scale-95 transition"
              >
                {num}
              </button>
            ))}
            <button 
              onClick={() => setInputPin(prev => prev.slice(0, -1))}
              className="bg-slate-800 hover:bg-red-900/50 text-red-400 text-xl font-bold py-4 rounded-lg active:scale-95 transition"
            >
              ⌫
            </button>
            <button 
              onClick={() => setInputPin(prev => prev + '0')}
              className="bg-slate-800 hover:bg-slate-700 text-white text-xl font-bold py-4 rounded-lg active:scale-95 transition"
            >
              0
            </button>
            <button 
              onClick={handleLogin}
              className="bg-accent hover:bg-emerald-600 text-primary text-xl font-bold py-4 rounded-lg active:scale-95 transition"
            >
              ➜
            </button>
          </div>
          
          <div className="bg-slate-800/50 p-2 rounded text-xs text-slate-400 mb-4 border border-slate-700">
            <p className="font-bold mb-1">Default Login:</p>
            {users.length === 0 ? (
               <p className="text-yellow-500 animate-pulse">Sedang memuat data user...</p>
            ) : (
              <div className="flex justify-between px-4">
                <span>Admin: 123456</span>
                <span>Kasir: 11223344</span>
              </div>
            )}
          </div>
          <button onClick={() => { localStorage.removeItem(STORE_KEY); setStoreId(null); setConnectError(null); }} className="text-xs text-slate-500 hover:text-white">
            Ganti Store ID
          </button>
        </div>
      </div>
    );
  }

  // Calculate Alerts for Sidebar Badge
  const lowStockProductsCount = products.filter(p => !p.isRecipe && p.stock <= 10).length;
  const lowStockIngredientsCount = ingredients.filter(i => i.stock <= 100).length;
  const totalAlerts = lowStockProductsCount + lowStockIngredientsCount;

  const activeOperatorName = activeShift ? activeShift.operatorName : currentUser.name;

  return (
    <div className="flex h-screen overflow-hidden bg-primary font-sans">
      {/* 1. Left Sidebar (Desktop Only) */}
      <aside className="hidden md:flex w-20 lg:w-64 bg-secondary border-r border-slate-800 flex-col justify-between shrink-0 transition-all">
        <div>
          <div className="p-4 md:p-6 flex items-center justify-center lg:justify-start gap-3">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-xl shadow-lg shadow-accent/20">Z</div>
            <span className="font-bold text-xl hidden lg:block text-white">Zyra POS</span>
          </div>
          
          <nav className="flex flex-col gap-2 px-2 mt-4">
            <SidebarItem icon={<LayoutDashboard size={24} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <SidebarItem icon={<Target size={24} />} label="Billiard" active={activeTab === 'billiard'} onClick={() => setActiveTab('billiard')} />
            <SidebarItem icon={<Coffee size={24} />} label="Cafe" active={activeTab === 'cafe'} onClick={() => setActiveTab('cafe')} />
             <SidebarItem icon={<Receipt size={24} />} label="Riwayat" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            
            {currentUser.role === 'admin' && (
              <>
                <div className="my-2 border-t border-slate-800 mx-2" />
                <SidebarItem icon={<Package size={24} />} label="Inventory" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} badge={totalAlerts > 0 ? totalAlerts : undefined} />
                <SidebarItem icon={<Settings size={24} />} label="Setting" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
              </>
            )}
          </nav>
        </div>
        
        <div className="p-4 border-t border-slate-800">
          <div 
             className="flex flex-col lg:flex-row items-center gap-3 mb-4 px-2 cursor-pointer hover:bg-slate-800 p-2 rounded transition"
             onClick={() => { if (currentUser.role === 'cashier') setShowShiftModal(true); }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md ${activeShift ? 'bg-green-600' : (currentUser.role === 'admin' ? 'bg-purple-600' : 'bg-slate-700')}`}>
              <Users size={16} />
            </div>
            <div className="hidden lg:block overflow-hidden">
              <p className="text-sm font-bold truncate flex items-center gap-2 text-white">
                 {activeOperatorName}
                 {currentUser.role === 'cashier' && <span className="text-[10px] bg-slate-700 px-1 rounded border border-slate-600">Ganti</span>}
              </p>
              <p className="text-xs text-slate-400 capitalize">{currentUser.role === 'admin' ? 'Owner' : 'Kasir'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center lg:justify-start gap-3 p-2 rounded-lg text-red-400 hover:bg-red-900/20 transition">
            <LogOut size={20} />
            <span className="hidden lg:block">Logout</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-primary relative w-full flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-slate-800/90 backdrop-blur-md border-b border-slate-700 p-4 shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-white capitalize flex items-center gap-2">
               {activeTab === 'billiard' ? <Target className="text-accent" size={20} /> : 
                activeTab === 'cafe' ? <Coffee className="text-orange-400" size={20} /> : 
                activeTab === 'dashboard' ? <LayoutDashboard className="text-blue-400" size={20} /> : null
               }
               {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="text-right hidden sm:block">
                <p className="text-[10px] text-slate-400">Operator</p>
                <p className="font-bold text-accent text-sm">{activeOperatorName}</p>
             </div>
             <div 
               className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600 cursor-pointer hover:bg-slate-600 text-white"
               onClick={() => currentUser.role === 'cashier' && setShowShiftModal(true)}
             >
                <UserCircle size={20} />
             </div>
          </div>
        </div>

        {/* Content Screens */}
        <div className="p-4 pb-24 md:p-6 md:pb-6 flex-1">
          {activeTab === 'dashboard' && <DashboardScreen transactions={transactions} tables={tables} />}
          {activeTab === 'billiard' && (
            <BilliardScreen 
              storeId={storeId!} 
              tables={tables} 
              onAddToCart={addToCartTable} 
              isAdmin={currentUser.role === 'admin'}
            />
          )}
          {activeTab === 'cafe' && (
            <CafeScreen 
              storeId={storeId!} 
              products={products} 
              ingredients={ingredients} 
              onAddToCart={addToCartProduct}
            />
          )}
          {activeTab === 'history' && <TransactionHistoryScreen transactions={transactions} />}
          {activeTab === 'inventory' && currentUser.role === 'admin' && <InventoryScreen storeId={storeId!} products={products} ingredients={ingredients} />}
          {activeTab === 'settings' && currentUser.role === 'admin' && <SettingsScreen storeId={storeId!} users={users} operators={operators} />}
                {activeTab === 'settings' && currentUser.role === 'admin' && (
                  <ErrorBoundary>
                    <SettingsScreen storeId={storeId!} users={users} operators={operators} />
                  </ErrorBoundary>
                )}
        </div>
      </main>

      {/* 3. Right Sidebar (Cart) - Desktop Only */}
      {(activeTab === 'billiard' || activeTab === 'cafe') && (
        <aside className="hidden lg:flex w-96 bg-secondary border-l border-slate-800 flex-col shadow-2xl shrink-0 z-10">
          <div className="p-4 border-b border-slate-700 font-bold text-lg flex items-center gap-2 bg-slate-800 text-white">
            <ShoppingCart size={20} /> Transaksi Aktif
          </div>
          <CartContent />
        </aside>
      )}

      {/* 4. Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-secondary border-t border-slate-800 flex justify-around p-2 z-40 pb-safe shadow-lg">
        <MobileNavItem icon={<LayoutDashboard size={20} />} label="Dash" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <MobileNavItem icon={<Target size={20} />} label="Billiard" active={activeTab === 'billiard'} onClick={() => setActiveTab('billiard')} />
        <MobileNavItem icon={<Coffee size={20} />} label="Cafe" active={activeTab === 'cafe'} onClick={() => setActiveTab('cafe')} />
        
        {currentUser.role === 'admin' ? (
           <>
             {/* Admin sees Inventory instead of History in the main slot to save space */}
             <MobileNavItem icon={<Package size={20} />} label="Gudang" active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} />
             <MobileNavItem icon={<Settings size={20} />} label="Admin" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
           </>
        ) : (
           <>
             <MobileNavItem icon={<Receipt size={20} />} label="Riwayat" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
             <MobileNavItem icon={<LogOut size={20} />} label="Logout" active={false} onClick={handleLogout} />
           </>
        )}
      </div>

      {/* 5. Mobile Floating Cart Button */}
      {(activeTab === 'billiard' || activeTab === 'cafe') && cart.length > 0 && (
        <button 
          onClick={() => setShowMobileCart(true)}
          className="lg:hidden fixed bottom-20 right-4 bg-accent text-primary p-4 rounded-full shadow-lg shadow-accent/40 z-30 flex items-center gap-2 animate-bounce-short"
        >
          <ShoppingCart size={24} />
          <span className="font-bold text-lg">{cart.length}</span>
        </button>
      )}

      {/* 6. Mobile Cart Drawer */}
      {showMobileCart && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end lg:hidden">
           <div className="w-full max-w-md bg-secondary h-full flex flex-col animate-in slide-in-from-right duration-200">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800 shadow-md">
                 <h3 className="font-bold text-lg text-white flex items-center gap-2"><ShoppingCart /> Keranjang</h3>
                 <button onClick={() => setShowMobileCart(false)} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><X size={24} /></button>
              </div>
              <CartContent />
           </div>
        </div>
      )}

      {/* Global Modals */}
      {isCheckoutOpen && (
        <CheckoutModal 
           storeId={storeId!}
           cart={cart}
           currentUser={currentUser!}
           products={products}
           ingredients={ingredients}
           tables={tables}
           activeOperator={activeShift?.operatorName}
           onClose={() => setIsCheckoutOpen(false)}
           onSuccess={() => {
             setIsCheckoutOpen(false);
             setCart([]);
             setShowMobileCart(false);
           }}
        />
      )}

      {/* Shift Management Modal */}
      {showShiftModal && (
        <ShiftManagementModal 
           key={activeShift ? 'end' : 'start'} 
           activeShift={activeShift}
           transactions={transactions}
           operators={operators}
           onStartShift={handleStartShift}
           onEndShift={handleEndShift}
           onClose={() => {
              if (activeShift) setShowShiftModal(false);
              else handleLogout();
           }}
        />
      )}

    </div>
  );
}

export default App;

// --- Helper Components ---

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick, badge }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col lg:flex-row items-center gap-1 lg:gap-3 p-3 rounded-lg transition w-full justify-center lg:justify-start relative ${active ? 'bg-accent text-primary font-bold shadow-lg shadow-accent/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
  >
    {icon}
    <span className="text-[10px] lg:text-sm hidden md:block">{label}</span>
    {badge && (
      <span className="absolute top-2 right-2 lg:top-auto lg:right-4 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
        {badge}
      </span>
    )}
  </button>
);

const MobileNavItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick }) => (
  <button 
     onClick={onClick}
     className={`flex flex-col items-center justify-center p-2 rounded-lg transition min-w-[60px] ${active ? 'text-accent' : 'text-slate-400'}`}
  >
     <div className={active ? 'scale-110 transition-transform' : ''}>{icon}</div>
     <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
);

// --- SHIFT MANAGEMENT MODAL ---
interface ShiftManagementModalProps {
  activeShift: Shift | null;
  transactions: Transaction[];
  operators: Operator[];
  onStartShift: (name: string, cash: number) => void;
  onEndShift: () => void;
  onClose: () => void;
}

const ShiftManagementModal: React.FC<ShiftManagementModalProps> = ({ activeShift, transactions, operators, onStartShift, onEndShift, onClose }) => {
   const [operatorName, setOperatorName] = useState('');
   const [startCash, setStartCash] = useState(0);
   const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);

   // Calculations for End Shift
   const report = useMemo(() => {
     if (!activeShift) return null;
     
     // Filter transactions within shift window
     const shiftTrans = transactions.filter(t => t.date >= activeShift.startTime);
     
     let cafeRevenue = 0;
     let cafeItemsSold = 0;
     let billiardRevenue = 0;
     let billiardHours = 0;

     shiftTrans.forEach(t => {
       t.items.forEach(item => {
         const totalItem = item.price * item.quantity;
         if (item.itemType === 'product') {
           cafeRevenue += totalItem;
           cafeItemsSold += item.quantity;
         } else if (item.itemType === 'table') {
           billiardRevenue += totalItem;
           if (item.duration) billiardHours += (item.duration / 60);
         }
       });
     });

     return {
       cafeRevenue,
       cafeItemsSold,
       billiardRevenue,
       billiardHours,
       totalRevenue: cafeRevenue + billiardRevenue,
       grandTotal: (cafeRevenue + billiardRevenue) + activeShift.startCash
     };
   }, [activeShift, transactions]);

   const handleWhatsapp = () => {
      if (!activeShift || !report) return;
      const text = `*Laporan Shift: ${activeShift.operatorName}*
--------------------------------
📅 Tgl: ${new Date().toLocaleDateString()}
⏰ Waktu: ${new Date(activeShift.startTime).toLocaleTimeString()} - ${new Date().toLocaleTimeString()}
💰 Modal Awal: Rp ${activeShift.startCash.toLocaleString()}

*🎱 Billiard*
- Durasi: ${report.billiardHours.toFixed(1)} Jam
- Total: Rp ${report.billiardRevenue.toLocaleString()}

*☕ Cafe*
- Terjual: ${report.cafeItemsSold} Item
- Total: Rp ${report.cafeRevenue.toLocaleString()}

--------------------------------
*💵 Total Pendapatan: Rp ${report.totalRevenue.toLocaleString()}*
*💰 Total Setoran (inc. modal): Rp ${report.grandTotal.toLocaleString()}*
      `;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
   };

   // RENDER START SHIFT
   if (!activeShift) {
      return (
        <Modal title="Mulai Shift Baru" onClose={onClose}>
           <div className="space-y-4">
              <div className="bg-slate-800 p-3 rounded text-sm text-slate-300">
                 Silakan masukkan nama operator dan uang modal di laci kasir untuk memulai shift.
              </div>
              
              <div>
                 <label className="block text-sm text-slate-400 mb-1">Pilih Nama Operator</label>
                 
                 {operators.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        {operators.map(op => (
                           <button 
                             key={op.id}
                             onClick={() => setOperatorName(op.name)}
                             className={`p-2 rounded border text-sm font-bold ${operatorName === op.name ? 'bg-accent text-primary border-accent' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                           >
                             {op.name}
                           </button>
                        ))}
                    </div>
                 ) : (
                    <p className="text-xs text-yellow-500 mb-2">Belum ada nama operator. Tambahkan di menu Admin &gt; Setting.</p>
                 )}

                 <input 
                    type="text" 
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    placeholder="Atau ketik manual..."
                 />
              </div>

              <div>
                 <label className="block text-sm text-slate-400 mb-1">Uang Modal (Kas Awal)</label>
                 <input 
                    type="number" 
                    value={startCash || ''}
                    onChange={(e) => setStartCash(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    placeholder="0"
                 />
              </div>

              <button 
                 disabled={!operatorName}
                 onClick={() => onStartShift(operatorName, startCash)}
                 className="w-full bg-accent hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-primary font-bold py-3 rounded text-lg mt-4"
              >
                 Mulai Shift
              </button>
           </div>
        </Modal>
      );
   }

   // RENDER END SHIFT (REPORT)
   return (
      <Modal title={`Laporan Shift - ${activeShift.operatorName}`} onClose={onClose}>
         {report && (
           <div className="space-y-4">
              <div className="flex justify-between items-center text-sm text-slate-400 border-b border-slate-700 pb-2">
                 <span>Mulai: {new Date(activeShift.startTime).toLocaleTimeString()}</span>
                 <span>Modal: Rp {activeShift.startCash.toLocaleString()}</span>
              </div>

              {/* Billiard Summary */}
              <div className="bg-slate-900 p-3 rounded border border-slate-800">
                 <h4 className="font-bold text-blue-400 flex items-center gap-2 mb-2"><Target size={16}/> Billiard</h4>
                 <div className="flex justify-between text-sm">
                    <span>Durasi Sewa</span>
                    <span>{report.billiardHours.toFixed(1)} Jam</span>
                 </div>
                 <div className="flex justify-between font-bold mt-1">
                    <span>Pendapatan</span>
                    <span>Rp {report.billiardRevenue.toLocaleString()}</span>
                 </div>
              </div>

              {/* Cafe Summary */}
              <div className="bg-slate-900 p-3 rounded border border-slate-800">
                 <h4 className="font-bold text-orange-400 flex items-center gap-2 mb-2"><Coffee size={16}/> Cafe</h4>
                 <div className="flex justify-between text-sm">
                    <span>Item Terjual</span>
                    <span>{report.cafeItemsSold} Unit</span>
                 </div>
                 <div className="flex justify-between font-bold mt-1">
                    <span>Pendapatan</span>
                    <span>Rp {report.cafeRevenue.toLocaleString()}</span>
                 </div>
              </div>

              {/* Grand Total */}
              <div className="bg-slate-800 p-4 rounded border border-slate-600">
                 <div className="flex justify-between text-lg">
                    <span className="text-slate-400">Total Transaksi</span>
                    <span className="font-bold text-white">Rp {report.totalRevenue.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between text-xl mt-2 pt-2 border-t border-slate-700">
                    <span className="text-emerald-400">Total Setoran</span>
                    <span className="font-bold text-emerald-400">Rp {report.grandTotal.toLocaleString()}</span>
                 </div>
                 <p className="text-[10px] text-slate-500 text-right mt-1">*Termasuk modal awal</p>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 gap-3 pt-2">
                 
                 {isConfirmingEnd ? (
                     <div className="bg-red-900/30 p-4 rounded border border-red-500 animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-white font-bold mb-2 text-center">⚠ Konfirmasi Tutup Shift</p>
                        <p className="text-xs text-slate-300 mb-4 text-center">Data pendapatan akan direset untuk operator selanjutnya.</p>
                        <div className="flex gap-2">
                           <button 
                              onClick={() => setIsConfirmingEnd(false)}
                              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded"
                           >
                              Batal
                           </button>
                           <button 
                              onClick={onEndShift}
                              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded"
                           >
                              Ya, Tutup
                           </button>
                        </div>
                     </div>
                 ) : (
                    <>
                     <div className="flex gap-2">
                           <button 
                              onClick={onClose}
                              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded"
                           >
                              Kembali
                           </button>
                           <button 
                              onClick={handleWhatsapp}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded flex items-center justify-center gap-2"
                           >
                              <Send size={18} /> WhatsApp
                           </button>
                     </div>
                     <button 
                              onClick={() => setIsConfirmingEnd(true)}
                              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded flex items-center justify-center gap-2"
                           >
                              <LogOut size={18} /> Lanjut Tutup Shift
                           </button>
                    </>
                 )}
              </div>
           </div>
         )}
      </Modal>
   );
};

// --- 1. Dashboard Screen ---
const DashboardScreen: React.FC<{ transactions: Transaction[], tables: Table[] }> = ({ transactions }) => {
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const todayTrans = transactions.filter(t => t.date >= today.getTime());
    const totalToday = todayTrans.reduce((acc, curr) => acc + curr.total, 0);
    const saleCount = todayTrans.filter(t => t.type === 'sale').length;
    const rentalCount = todayTrans.filter(t => t.type === 'rental').length;

    // Last 7 days chart data
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0,0,0,0);
      const dayTotal = transactions
        .filter(t => {
          const tDate = new Date(t.date);
          tDate.setHours(0,0,0,0);
          return tDate.getTime() === d.getTime();
        })
        .reduce((acc, t) => acc + t.total, 0);
      
      chartData.push({
        name: d.toLocaleDateString('id-ID', { weekday: 'short' }),
        total: dayTotal
      });
    }

    return { totalToday, saleCount, rentalCount, chartData };
  }, [transactions]);

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-secondary p-4 md:p-6 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm">Pendapatan Hari Ini</p>
          <p className="text-2xl md:text-3xl font-bold text-accent">Rp {stats.totalToday.toLocaleString()}</p>
        </div>
        <div className="bg-secondary p-4 md:p-6 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm">Transaksi Cafe</p>
          <p className="text-2xl md:text-3xl font-bold text-white">{stats.saleCount}</p>
        </div>
        <div className="bg-secondary p-4 md:p-6 rounded-xl border border-slate-700">
          <p className="text-slate-400 text-sm">Sewa Meja</p>
          <p className="text-2xl md:text-3xl font-bold text-white">{stats.rentalCount}</p>
        </div>
      </div>

      <div className="bg-secondary p-4 md:p-6 rounded-xl border border-slate-700 h-[300px] md:h-[400px]">
        <h3 className="font-bold mb-4">Grafik Pendapatan (7 Hari)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickMargin={5} />
            <YAxis stroke="#94a3b8" fontSize={12} width={60} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
              formatter={(value: number) => [`Rp ${value.toLocaleString()}`, 'Total']}
            />
            <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// --- 2. Billiard Screen (Updated) ---
interface BilliardScreenProps {
  storeId: string;
  tables: Table[];
  onAddToCart: (table: Table, duration: number) => void;
  isAdmin: boolean;
}

const BilliardScreen: React.FC<BilliardScreenProps> = ({ storeId, tables, onAddToCart, isAdmin }) => {
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [manageTableMode, setManageTableMode] = useState(false);
  const [isMovingTable, setIsMovingTable] = useState<Table | null>(null);
  const [stopTableTarget, setStopTableTarget] = useState<Table | null>(null);

  return (
    <div>
      <div className="flex justify-end mb-4">
        {isAdmin && (
           <button 
             onClick={() => setManageTableMode(true)}
             className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded flex items-center gap-2 text-sm"
           >
             <Wrench size={16} /> Atur Meja
           </button>
        )}
      </div>
      
      {/* Responsive Grid: 1 col mobile, 2 col tablet, 3 col desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
        {tables.map(table => (
          <TableCard 
            key={table.id} 
            table={table} 
            onStart={() => setSelectedTable(table)} 
            onStop={() => setStopTableTarget(table)}
            onTopup={() => setSelectedTable(table)}
            onMove={() => setIsMovingTable(table)}
          />
        ))}
      </div>

      {selectedTable && (
        <TableDurationModal 
          table={selectedTable} 
          onClose={() => setSelectedTable(null)} 
          onAddToOrder={(duration) => {
            onAddToCart(selectedTable, duration);
            setSelectedTable(null);
          }}
        />
      )}

      {manageTableMode && (
        <ErrorBoundary>
          <TableManagementModal 
            storeId={storeId} 
            tables={tables} 
            onClose={() => setManageTableMode(false)} 
          />
        </ErrorBoundary>
      )}

      {isMovingTable && (
         <MoveTableModal
            storeId={storeId}
            fromTable={isMovingTable}
            tables={tables}
            onClose={() => setIsMovingTable(null)}
         />
      )}

      {stopTableTarget && (
        <StopTableModal 
          storeId={storeId}
          table={stopTableTarget}
          onClose={() => setStopTableTarget(null)}
        />
      )}
    </div>
  );
};

interface TableCardProps {
  table: Table;
  onStart: () => void;
  onStop: () => void;
  onTopup: () => void;
  onMove: () => void;
}

const TableCard: React.FC<TableCardProps> = ({ table, onStart, onStop, onTopup, onMove }) => {
  const [timeLeft, setTimeLeft] = useState<string>('--:--');
  
  useEffect(() => {
    if (table.status === 'available' || !table.endTime) {
      setTimeLeft('--:--');
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = table.endTime! - now;
      
      if (diff <= 0) {
        setTimeLeft('00:00');
      } else {
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [table]);

  const isOccupied = table.status === 'occupied';

  return (
    <div className={`rounded-xl p-4 md:p-6 border-2 relative overflow-hidden transition-all ${isOccupied ? 'bg-slate-900 border-red-500 shadow-red-900/20' : 'bg-secondary border-slate-700 hover:border-accent'}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">{table.name}</h3>
          <p className="text-xs text-slate-400">Rp {table.costPerHour.toLocaleString()}/jam</p>
        </div>
        <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${isOccupied ? 'bg-red-500 text-white' : 'bg-accent text-primary'}`}>
          {table.status}
        </span>
      </div>

      <div className="text-center py-2 md:py-4">
        <p className={`text-4xl md:text-5xl font-mono font-bold ${isOccupied ? 'text-red-400' : 'text-slate-200'}`}>{timeLeft}</p>
        <p className="text-xs text-slate-500 mt-1 truncate px-2">{isOccupied ? (table.currentCustomer || 'Sedang Main') : 'Tersedia'}</p>
      </div>

      <div className="mt-4">
        {isOccupied ? (
          <div className="grid grid-cols-3 gap-2">
             <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTopup(); }} className="bg-blue-600 hover:bg-blue-700 text-white py-3 md:py-2 rounded flex flex-col items-center justify-center text-[10px] gap-1 active:scale-95 transition">
                <Clock size={16} /> Topup
             </button>
             <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMove(); }} className="bg-orange-600 hover:bg-orange-700 text-white py-3 md:py-2 rounded flex flex-col items-center justify-center text-[10px] gap-1 active:scale-95 transition">
                <ArrowRightLeft size={16} /> Pindah
             </button>
             <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStop(); }} className="bg-red-600 hover:bg-red-700 text-white py-3 md:py-2 rounded flex flex-col items-center justify-center text-[10px] gap-1 active:scale-95 transition">
                <Power size={16} /> Stop
             </button>
          </div>
        ) : (
          <button onClick={onStart} className="w-full bg-accent hover:bg-emerald-600 text-primary font-bold py-3 md:py-4 rounded flex items-center justify-center gap-2 text-lg active:scale-95 transition">
            <PlayCircle size={20} /> Mulai Sewa
          </button>
        )}
      </div>
      
      <div className="absolute top-2 right-12 flex gap-2">
        {table.remoteOn && (
          <a href={table.remoteOn} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-white" title="Lampu ON">
            <Power size={14} />
          </a>
        )}
        {table.remoteOff && (
          <a href={table.remoteOff} target="_blank" rel="noreferrer" className="text-red-400 hover:text-white" title="Lampu OFF">
            <Power size={14} />
          </a>
        )}
        {table.remoteToggle && (
          <a href={table.remoteToggle} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-white" title="Lampu TOGGLE">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
};

// --- New: Stop Table Modal ---
const StopTableModal: React.FC<{ storeId: string, table: Table, onClose: () => void }> = ({ storeId, table, onClose }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirmStop = async () => {
    setLoading(true);
    try {
      const tableRef = doc(db, `stores/${storeId}/tables`, table.id);
      
      // Use setDoc with merge: true to reset values safely
      await setDoc(tableRef, {
        status: 'available',
        startTime: 0,
        endTime: 0,
        currentCustomer: '', 
        duration: 0
      }, { merge: true });
      // Toggle lamp off for this table (best-effort)
      try {
        const idx = tables.findIndex(t => t.id === table.id);
        const num = deriveTableNumber(table.name, idx >= 0 ? idx : 0);
        await controlLamp(num, 'off');
      } catch (e) {
        console.warn('Failed to control lamp on stop', e);
      }
      
      onClose();
    } catch (e: any) {
      console.error(e);
      let msg = e.message;
      if(e.code === 'permission-denied') msg = "Izin ditolak. Cek Rules di Firebase Console.";
      alert(`Gagal mematikan meja: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Konfirmasi Stop Meja" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-slate-300">
          Apakah Anda yakin ingin menghentikan permainan di <span className="font-bold text-white">{table.name}</span>?
        </p>
        
        <div className="bg-red-900/20 border border-red-500/50 p-3 rounded text-sm text-red-200 space-y-1">
           <p className="flex items-center gap-2"><AlertTriangle size={14}/> Sisa waktu akan hangus.</p>
           <p className="flex items-center gap-2"><AlertTriangle size={14}/> Status meja akan menjadi 'Tersedia'.</p>
           <p className="flex items-center gap-2"><AlertTriangle size={14}/> Lampu akan mati (jika terhubung).</p>
        </div>

        <div className="flex gap-3 pt-4">
          <button 
            onClick={onClose} 
            disabled={loading}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded font-bold"
          >
            Batal
          </button>
          <button 
            onClick={handleConfirmStop}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded font-bold flex items-center justify-center gap-2"
          >
            {loading ? 'Memproses...' : 'YA, MATIKAN MEJA'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// --- New: Table Duration Selector ---
interface TableDurationModalProps {
  table: Table;
  onClose: () => void;
  onAddToOrder: (duration: number) => void;
}

const TableDurationModal: React.FC<TableDurationModalProps> = ({ table, onClose, onAddToOrder }) => {
  const [duration, setDuration] = useState(60);
  const isTopup = table.status === 'occupied';

  return (
    <Modal title={isTopup ? `Topup ${table.name}` : `Sewa ${table.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
           {isTopup ? 'Pilih durasi perpanjangan waktu.' : 'Pilih durasi bermain.'} 
           Item akan ditambahkan ke keranjang belanja.
        </p>
        
        <div>
          <label className="block text-sm text-slate-400 mb-1">Durasi (Menit)</label>
          <div className="flex gap-2 flex-wrap">
            {[30, 60, 120, 180].map(m => (
              <button 
                key={m} 
                onClick={() => setDuration(m)}
                className={`flex-1 py-3 rounded border font-bold min-w-[70px] ${duration === m ? 'border-accent bg-accent/20 text-accent' : 'border-slate-600 text-slate-400 bg-slate-800'}`}
              >
                {m/60} Jam
              </button>
            ))}
          </div>
          <input 
            type="number" 
            value={duration} 
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full mt-2 bg-slate-900 border border-slate-700 rounded p-3 text-white"
            placeholder="Custom (menit)"
          />
        </div>

        <div className="bg-slate-900 p-4 rounded border border-slate-700">
           <div className="flex justify-between items-center">
            <span className="text-slate-400">Estimasi Biaya:</span>
            <span className="text-xl font-bold text-white">Rp {((duration/60) * table.costPerHour).toLocaleString()}</span>
           </div>
        </div>

        <button 
          onClick={() => onAddToOrder(duration)}
          className="w-full bg-accent hover:bg-emerald-600 text-primary font-bold py-3 rounded text-lg transition"
        >
          {isTopup ? '+ Tambah Durasi' : '+ Tambah ke Keranjang'}
        </button>
      </div>
    </Modal>
  );
};

// --- Move Table Modal ---
const MoveTableModal: React.FC<{ storeId: string, fromTable: Table, tables: Table[], onClose: () => void }> = ({ storeId, fromTable, tables, onClose }) => {
   const [loading, setLoading] = useState(false);
   const availableTables = tables.filter(t => t.status === 'available');

   const handleMove = async (toTableId: string) => {
      if (!toTableId || loading) return;
      
      // Removed window.confirm to prevent browser blocking.
      setLoading(true);

      try {
         // FIX: Strictly converting values to primitives to avoid undefined errors
         const moveData = {
            status: 'occupied',
            startTime: Number(fromTable.startTime || Date.now()),
            endTime: Number(fromTable.endTime || (Date.now() + 3600000)),
            duration: Number(fromTable.duration || 60),
            currentCustomer: String(fromTable.currentCustomer || 'Pelanggan'),
         };

         // 1. Update To Table (Destination) using setDoc with merge (Safe)
         await setDoc(doc(db, `stores/${storeId}/tables`, toTableId), moveData, { merge: true });

         // 2. Reset From Table (Origin) using setDoc with merge (Safe)
         await setDoc(doc(db, `stores/${storeId}/tables`, fromTable.id), {
            status: 'available',
            startTime: 0,
            endTime: 0,
            currentCustomer: '',
            duration: 0
         }, { merge: true });

         // Try toggling lamps: turn off origin, turn on destination (best-effort)
         try {
           const fromIdx = tables.findIndex(t => t.id === fromTable.id);
           const toIdx = tables.findIndex(t => t.id === toTableId);
           const fromNum = deriveTableNumber(fromTable.name, fromIdx >= 0 ? fromIdx : 0);
           const toName = tables.find(t => t.id === toTableId)?.name;
           const toNum = deriveTableNumber(toName, toIdx >= 0 ? toIdx : 0);
           // If from was occupied, turn it off
           await controlLamp(fromNum, 'off').catch(e => console.warn('control from error', e));
           // Turn on destination with duration equal to moveData.endTime - now
           const dur = moveData.endTime ? Math.max(0, Math.ceil((moveData.endTime - Date.now()) / 1000)) : undefined;
           await controlLamp(toNum, 'on', dur).catch(e => console.warn('control to error', e));
         } catch (e) {
           console.warn('Lamp control during move failed', e);
         }

         onClose();
      } catch (e: any) {
         console.error(e);
         let msg = e.message;
         if(e.code === 'permission-denied') msg = "Izin ditolak. Cek Rules di Firebase Console.";
         alert(`Gagal memindahkan meja: ${msg}`);
      } finally {
         setLoading(false);
      }
   };

   return (
      <Modal title={`Pindah Meja (${fromTable.name})`} onClose={onClose}>
         <div className="space-y-4">
            <p className="text-sm text-slate-400">
              {loading ? 'Sedang memindahkan data...' : 'Pilih meja tujuan yang kosong:'}
            </p>
            
            {availableTables.length === 0 ? (
               <p className="text-red-400 bg-red-900/20 p-3 rounded">Tidak ada meja kosong tersedia.</p>
            ) : (
               <div className="grid grid-cols-2 gap-3">
                  {availableTables.map(t => (
                     <button 
                        key={t.id}
                        onClick={() => handleMove(t.id)}
                        disabled={loading}
                        className="bg-slate-800 hover:bg-slate-700 border border-slate-600 p-4 rounded text-white active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center"
                     >
                        <span className="font-bold">{t.name}</span>
                        {loading && <span className="text-[10px] text-accent animate-pulse">Memproses...</span>}
                     </button>
                  ))}
               </div>
            )}
         </div>
      </Modal>
   )
}


// --- Table Management Modal ---
const TableManagementModal: React.FC<{ storeId: string, tables: Table[], onClose: () => void }> = ({ storeId, tables, onClose }) => {
  const [newTableName, setNewTableName] = useState('');
  const [newTableCost, setNewTableCost] = useState(20000);
  const [newTableRemoteOn, setNewTableRemoteOn] = useState('');
  const [newTableRemoteOff, setNewTableRemoteOff] = useState('');
  const [newTableRemoteToggle, setNewTableRemoteToggle] = useState('');

  const handleAddTable = async () => {
    if (!newTableName) return;
    try {
      const id = `table-${Date.now()}`;
      await setDoc(doc(db, `stores/${storeId}/tables`, id), {
        name: newTableName,
        status: 'available',
        costPerHour: Number(newTableCost),
        remoteOn: newTableRemoteOn || '',
        remoteOff: newTableRemoteOff || '',
        remoteToggle: newTableRemoteToggle || ''
      });
      setNewTableName('');
      setNewTableRemoteOn('');
      setNewTableRemoteOff('');
      setNewTableRemoteToggle('');
    } catch (e) {
      console.error(e);
      alert("Gagal menambah meja");
    }
  };

  const handleDeleteTable = async (id: string) => {
    if(confirm("Hapus meja ini?")) {
      try {
        await deleteDoc(doc(db, `stores/${storeId}/tables`, id));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleUpdatePrice = async (id: string, newPrice: number) => {
     try {
       await updateDoc(doc(db, `stores/${storeId}/tables`, id), { costPerHour: Number(newPrice) });
     } catch (e) { console.error(e); }
  };

  const handleUpdateRemoteField = async (id: string, field: 'remoteOn' | 'remoteOff' | 'remoteToggle', url: string) => {
     try {
       const updateObj: any = {};
       updateObj[field] = url;
       await updateDoc(doc(db, `stores/${storeId}/tables`, id), updateObj);
     } catch (e) { console.error(e); }
  };

  return (
    <Modal title="Atur Meja Billiard" onClose={onClose}>
      <div className="space-y-6">
        {/* Add New */}
        <div className="bg-slate-900 p-4 rounded border border-slate-700">
          <h4 className="font-bold mb-2 text-sm text-slate-300">Tambah Meja Baru</h4>
          <div className="space-y-2">
            <input 
              type="text" 
              placeholder="Nama Meja (e.g. Meja VIP)" 
              className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
            />
            <input 
              type="number" 
              placeholder="Harga/Jam" 
              className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
              value={newTableCost}
              onChange={(e) => setNewTableCost(Number(e.target.value))}
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Link ON (Arduino)"
                className="bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
                value={newTableRemoteOn}
                onChange={(e) => setNewTableRemoteOn(e.target.value)}
              />
              <input
                type="text"
                placeholder="Link OFF (Arduino)"
                className="bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
                value={newTableRemoteOff}
                onChange={(e) => setNewTableRemoteOff(e.target.value)}
              />
              <input
                type="text"
                placeholder="Link TOGGLE (Arduino)"
                className="bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"
                value={newTableRemoteToggle}
                onChange={(e) => setNewTableRemoteToggle(e.target.value)}
              />
            </div>
            <button 
              onClick={handleAddTable}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded text-sm font-bold"
            >
              + Tambah
            </button>
          </div>
        </div>

        {/* List Tables */}
        <div className="space-y-2">
           <h4 className="font-bold text-sm text-slate-300">Daftar Meja</h4>
           {tables.map(table => (
             <div key={table.id} className="bg-slate-800 p-3 rounded border border-slate-700 flex flex-col gap-2">
               <div className="flex justify-between items-center">
                 <span className="font-bold text-white">{table.name}</span>
                 <button onClick={() => handleDeleteTable(table.id)} className="text-red-400 hover:text-red-300">
                   <Trash2 size={16} />
                 </button>
               </div>
               <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500">Harga/Jam</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                          defaultValue={table.costPerHour}
                          onBlur={(e) => handleUpdatePrice(table.id, Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500">Remote ON / OFF / TOGGLE (optional)</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                            defaultValue={table.remoteOn}
                            placeholder="http://.../action=on"
                            onBlur={(e) => handleUpdateRemoteField(table.id, 'remoteOn', e.target.value)}
                          />
                          <input
                            type="text"
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                            defaultValue={table.remoteOff}
                            placeholder="http://.../action=off"
                            onBlur={(e) => handleUpdateRemoteField(table.id, 'remoteOff', e.target.value)}
                          />
                          <input
                            type="text"
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                            defaultValue={table.remoteToggle}
                            placeholder="http://.../action=toggle"
                            onBlur={(e) => handleUpdateRemoteField(table.id, 'remoteToggle', e.target.value)}
                          />
                        </div>
                      </div>
               </div>
             </div>
           ))}
        </div>
      </div>
    </Modal>
  );
};


// --- 3. Cafe Screen ---
interface CafeScreenProps {
  storeId: string;
  products: Product[];
  ingredients: Ingredient[];
  onAddToCart: (product: Product, price: number, variantType?: string) => void;
}

const CafeScreen: React.FC<CafeScreenProps> = ({ storeId, products, ingredients, onAddToCart }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];
  
  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div></div>
        <div className="w-full md:w-auto flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-bold capitalize whitespace-nowrap transition flex-shrink-0 ${selectedCategory === cat ? 'bg-accent text-primary' : 'bg-secondary text-slate-400 hover:text-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 relative">
        <Search className="absolute left-3 top-3 text-slate-500" size={20} />
        <input 
          type="text" 
          placeholder="Cari menu cafe..." 
          className="w-full bg-secondary border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-accent"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {filteredProducts.map(product => (
          <ProductCard 
            key={product.id} 
            product={product} 
            onAdd={onAddToCart} 
          />
        ))}
      </div>
    </div>
  );
};

const ProductCard: React.FC<{ product: Product, onAdd: (p: Product, price: number, variant?: string) => void }> = ({ product, onAdd }) => {
  const isOutOfStock = !product.isRecipe && product.stock <= 0;
  
  return (
    <div className={`bg-secondary rounded-xl p-3 md:p-4 border border-slate-700 hover:border-accent transition flex flex-col justify-between group ${isOutOfStock ? 'opacity-50' : ''}`}>
      <div>
        <div className="flex justify-between items-start mb-2">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 flex items-center justify-center text-orange-400">
             {product.isRecipe ? <ChefHat size={18} /> : <Package size={18} />}
          </div>
          {!product.isRecipe && (
             <span className={`text-[10px] px-2 py-1 rounded font-bold ${isOutOfStock ? 'bg-red-500/20 text-red-500' : 'bg-slate-800 text-slate-400'}`}>
                {product.stock}
             </span>
          )}
        </div>
        <h3 className="font-bold text-white leading-tight mb-1 text-sm md:text-base line-clamp-2">{product.name}</h3>
        <p className="text-[10px] md:text-xs text-slate-400 mb-3">{product.category}</p>
      </div>
      
      {product.isVariant && product.variants && product.variants.length > 0 ? (
         <div className="space-y-1 md:space-y-2 mt-2">
            {product.variants.map((v, idx) => (
               <button 
                 key={idx}
                 onClick={() => onAdd(product, v.price, v.name)}
                 className="w-full bg-slate-800 hover:bg-accent hover:text-primary text-slate-300 text-[10px] md:text-xs py-2 rounded flex justify-between px-2 transition active:scale-95"
               >
                 <span>{v.name}</span>
                 <span className="font-bold">Rp {v.price.toLocaleString()}</span>
               </button>
            ))}
         </div>
      ) : (
         <div className="flex items-center justify-between mt-2">
            <span className="font-bold text-accent text-sm md:text-base">Rp {product.price.toLocaleString()}</span>
            <button 
               onClick={() => !isOutOfStock && onAdd(product, product.price)}
               disabled={isOutOfStock}
               className="bg-slate-700 hover:bg-accent hover:text-primary text-white p-2 rounded-lg transition active:scale-95"
            >
               <Plus size={16} />
            </button>
         </div>
      )}
    </div>
  );
};

// --- Inventory Screen (Admin Only) ---
const InventoryScreen: React.FC<{ storeId: string, products: Product[], ingredients: Ingredient[] }> = ({ storeId, products, ingredients }) => {
  const [activeSubTab, setActiveSubTab] = useState<'products' | 'ingredients' | 'restock' | 'audit'>('products');
  const [isAddMode, setIsAddMode] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, name: string, type: 'product' | 'ingredient' } | null>(null);

  // Filter low stock
  const lowStockProducts = products.filter(p => !p.isRecipe && p.stock <= 10);
  const lowStockIngredients = ingredients.filter(i => i.stock <= 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
           <Package className="text-purple-400" /> Inventory
        </h2>
        <div className="flex gap-2">
           <button 
             onClick={() => { setEditProduct(null); setIsAddMode(true); }}
             className="bg-accent hover:bg-emerald-600 text-primary px-3 py-2 rounded font-bold flex items-center gap-2 text-sm"
           >
             <Plus size={16} /> <span className="hidden sm:inline">Tambah Item</span>
           </button>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-700 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={() => setActiveSubTab('products')} className={`pb-2 px-2 font-bold whitespace-nowrap ${activeSubTab === 'products' ? 'text-accent border-b-2 border-accent' : 'text-slate-400'}`}>Produk Jual</button>
        <button onClick={() => setActiveSubTab('ingredients')} className={`pb-2 px-2 font-bold whitespace-nowrap ${activeSubTab === 'ingredients' ? 'text-accent border-b-2 border-accent' : 'text-slate-400'}`}>Bahan Baku</button>
        <button onClick={() => setActiveSubTab('restock')} className={`pb-2 px-2 font-bold flex items-center gap-2 whitespace-nowrap ${activeSubTab === 'restock' ? 'text-accent border-b-2 border-accent' : 'text-slate-400'}`}>
           Restok 
           {(lowStockProducts.length + lowStockIngredients.length) > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{lowStockProducts.length + lowStockIngredients.length}</span>
           )}
        </button>
        <button onClick={() => setActiveSubTab('audit')} className={`pb-2 px-2 font-bold whitespace-nowrap ${activeSubTab === 'audit' ? 'text-accent border-b-2 border-accent' : 'text-slate-400'}`}>Audit Stok</button>
      </div>

      <div className="bg-secondary rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
        {activeSubTab === 'products' && (
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-slate-800 text-slate-400 text-sm">
              <tr>
                <th className="p-4">Nama Produk</th>
                <th className="p-4">Kategori</th>
                <th className="p-4">Harga</th>
                <th className="p-4">Stok</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {products.map(product => (
                <tr key={product.id} className="hover:bg-slate-800/50">
                  <td className="p-4 font-medium">
                    {product.name}
                    {product.isVariant && <span className="text-xs text-orange-400 border border-orange-400 px-1 rounded ml-2">Varian</span>}
                    {product.isRecipe && <span className="text-xs text-blue-400 border border-blue-400 px-1 rounded ml-2">Racikan</span>}
                  </td>
                  <td className="p-4 text-slate-400">{product.category}</td>
                  <td className="p-4">
                     {product.isVariant ? 'Beragam' : `Rp ${product.price.toLocaleString()}`}
                  </td>
                  <td className={`p-4 font-bold ${!product.isRecipe && product.stock <= 10 ? 'text-red-500' : 'text-slate-200'}`}>
                    {product.isRecipe ? '∞' : product.stock}
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    <button 
                       onClick={() => { setEditProduct(product); setIsAddMode(true); }}
                       className="text-blue-400 hover:text-white p-2"
                    >
                       <Edit size={18} />
                    </button>
                    <button 
                       onClick={() => setDeleteTarget({ id: product.id, name: product.name, type: 'product' })}
                       className="text-red-400 hover:text-white p-2"
                    >
                       <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSubTab === 'ingredients' && (
           <table className="w-full text-left min-w-[600px]">
            <thead className="bg-slate-800 text-slate-400 text-sm">
              <tr>
                <th className="p-4">Nama Bahan</th>
                <th className="p-4">Satuan</th>
                <th className="p-4">Stok</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
               {ingredients.map(ing => (
                  <tr key={ing.id} className="hover:bg-slate-800/50">
                     <td className="p-4 font-medium">{ing.name}</td>
                     <td className="p-4 text-slate-400">{ing.unit}</td>
                     <td className={`p-4 font-bold ${ing.stock <= 100 ? 'text-red-500' : 'text-white'}`}>{ing.stock}</td>
                     <td className="p-4 text-right">
                        <button 
                           onClick={() => setDeleteTarget({ id: ing.id, name: ing.name, type: 'ingredient' })}
                           className="text-red-400 hover:text-white p-2"
                        >
                           <Trash2 size={18} />
                        </button>
                     </td>
                  </tr>
               ))}
            </tbody>
           </table>
        )}
        </div>
        
        {activeSubTab === 'restock' && (
           <div className="p-4">
              <h3 className="font-bold text-red-400 mb-4 flex items-center gap-2">
                 <AlertTriangle size={20} /> Stok Menipis
              </h3>
              
              {lowStockProducts.length === 0 && lowStockIngredients.length === 0 ? (
                 <p className="text-slate-500 text-center py-10">Stok aman semua!</p>
              ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                       <h4 className="font-bold mb-2 text-white">Produk Jual (Limit 10)</h4>
                       <ul className="space-y-2">
                          {lowStockProducts.map(p => (
                             <li key={p.id} className="bg-slate-800 p-3 rounded flex justify-between border border-red-900/50">
                                <span>{p.name}</span>
                                <span className="font-bold text-red-500">{p.stock} Unit</span>
                             </li>
                          ))}
                       </ul>
                    </div>
                    <div>
                       <h4 className="font-bold mb-2 text-white">Bahan Baku (Limit 100)</h4>
                       <ul className="space-y-2">
                          {lowStockIngredients.map(i => (
                             <li key={i.id} className="bg-slate-800 p-3 rounded flex justify-between border border-red-900/50">
                                <span>{i.name}</span>
                                <span className="font-bold text-red-500">{i.stock} {i.unit}</span>
                             </li>
                          ))}
                       </ul>
                    </div>
                 </div>
              )}
           </div>
        )}

        {activeSubTab === 'audit' && (
           <AuditTable storeId={storeId} products={products} ingredients={ingredients} />
        )}
      </div>

      {(isAddMode || editProduct) && (
        <AddProductModal 
          storeId={storeId} 
          onClose={() => { setIsAddMode(false); setEditProduct(null); }} 
          ingredients={ingredients}
          editingProduct={editProduct}
        />
      )}

      {deleteTarget && (
        <Modal title="Hapus Item" onClose={() => setDeleteTarget(null)}>
           <div className="space-y-4">
              <p className="text-slate-300">
                 Apakah Anda yakin ingin menghapus {deleteTarget.type === 'product' ? 'produk' : 'bahan'} <span className="font-bold text-white">{deleteTarget.name}</span>?
              </p>
              <div className="flex gap-2">
                 <button onClick={() => setDeleteTarget(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded font-bold">Batal</button>
                 <button 
                    onClick={async () => {
                       try {
                          const collectionName = deleteTarget.type === 'product' ? 'products' : 'ingredients';
                          await deleteDoc(doc(db, `stores/${storeId}/${collectionName}`, deleteTarget.id));
                          setDeleteTarget(null);
                       } catch(e) {
                          console.error(e);
                          alert("Gagal menghapus item.");
                       }
                    }} 
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-bold"
                 >
                    Hapus
                 </button>
              </div>
           </div>
        </Modal>
      )}
    </div>
  );
};

// --- New: Audit Table Component ---
const AuditTable: React.FC<{ storeId: string, products: Product[], ingredients: Ingredient[] }> = ({ storeId, products, ingredients }) => {
   const auditItems = useMemo(() => {
      const prods = products.filter(p => !p.isRecipe).map(p => ({
         id: p.id,
         name: p.name,
         systemStock: p.stock,
         unit: 'Unit',
         type: 'product',
         collection: 'products'
      }));
      const ings = ingredients.map(i => ({
         id: i.id,
         name: i.name,
         systemStock: i.stock,
         unit: i.unit,
         type: 'ingredient',
         collection: 'ingredients'
      }));
      return [...prods, ...ings];
   }, [products, ingredients]);

   return (
      <div className="w-full overflow-x-auto">
         <table className="w-full text-left min-w-[600px]">
            <thead className="bg-slate-800 text-slate-400 text-sm">
               <tr>
                  <th className="p-4">Nama Item</th>
                  <th className="p-4">Tipe</th>
                  <th className="p-4">Stok Sistem</th>
                  <th className="p-4 w-32">Stok Fisik</th>
                  <th className="p-4">Selisih</th>
                  <th className="p-4 text-right">Aksi</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
               {auditItems.map(item => (
                  <AuditRow key={item.id} item={item} storeId={storeId} />
               ))}
            </tbody>
         </table>
      </div>
   )
}

const AuditRow: React.FC<{ item: any, storeId: string }> = ({ item, storeId }) => {
   const [physicalStock, setPhysicalStock] = useState<string>('');
   
   const diff = physicalStock === '' ? 0 : Number(physicalStock) - item.systemStock;

   const handleAdjust = async () => {
      if (physicalStock === '') return;
      const confirmMsg = `Update stok ${item.name} dari ${item.systemStock} menjadi ${physicalStock}?`;
      if (confirm(confirmMsg)) {
         try {
            await updateDoc(doc(db, `stores/${storeId}/${item.collection}`, item.id), {
               stock: Number(physicalStock)
            });
            alert("Stok berhasil disesuaikan.");
            setPhysicalStock('');
         } catch (e) {
            console.error(e);
            alert("Gagal update stok.");
         }
      }
   }

   return (
      <tr className="hover:bg-slate-800/50">
         <td className="p-4 font-medium">{item.name}</td>
         <td className="p-4">
            <span className={`text-[10px] px-2 py-1 rounded ${item.type === 'product' ? 'bg-blue-900/30 text-blue-400' : 'bg-purple-900/30 text-purple-400'}`}>
               {item.type === 'product' ? 'Produk' : 'Bahan'}
            </span>
         </td>
         <td className="p-4 text-slate-300">{item.systemStock} {item.unit}</td>
         <td className="p-4">
            <input 
               type="number" 
               className="w-24 bg-slate-900 border border-slate-600 rounded p-1 text-white text-right"
               placeholder="0"
               value={physicalStock}
               onChange={(e) => setPhysicalStock(e.target.value)}
            />
         </td>
         <td className="p-4">
            {physicalStock !== '' && (
               <span className={`font-bold ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                  {diff > 0 ? '+' : ''}{diff}
               </span>
            )}
         </td>
         <td className="p-4 text-right">
            <button 
               onClick={handleAdjust}
               disabled={physicalStock === '' || diff === 0}
               className="text-xs bg-slate-700 hover:bg-accent hover:text-primary disabled:opacity-20 disabled:hover:bg-slate-700 disabled:hover:text-white px-3 py-1 rounded text-white transition"
            >
               Sesuaikan
            </button>
         </td>
      </tr>
   )
}

// --- Add Product Modal (Updated for Recipe & Variants) ---
const AddProductModal: React.FC<{ storeId: string, onClose: () => void, ingredients: Ingredient[], editingProduct: Product | null }> = ({ storeId, onClose, ingredients, editingProduct }) => {
  const [activeTab, setActiveTab] = useState<'product' | 'ingredient'>('product');
  
  // Product Form
  const [name, setName] = useState(editingProduct?.name || '');
  const [price, setPrice] = useState(editingProduct?.price || 0);
  const [category, setCategory] = useState(editingProduct?.category || 'Minuman');
  const [stock, setStock] = useState(editingProduct?.stock || 0);
  const [isVariant, setIsVariant] = useState(editingProduct?.isVariant || false);
  const [variants, setVariants] = useState<Variant[]>(editingProduct?.variants || []);
  const [isRecipe, setIsRecipe] = useState(editingProduct?.isRecipe || false);
  const [recipe, setRecipe] = useState<RecipeItem[]>(editingProduct?.recipe || []);

  // Temporary Inputs for adding variants/recipe items inline
  const [newVarName, setNewVarName] = useState('');
  const [newVarPrice, setNewVarPrice] = useState<string>('');
  const [newRecipeIngId, setNewRecipeIngId] = useState('');
  const [newRecipeAmount, setNewRecipeAmount] = useState<string>('');

  // Ingredient Form
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState('gram');
  const [ingStock, setIngStock] = useState(0);

  const handleAddVariant = () => {
     if (newVarName && newVarPrice) {
        setVariants([...variants, { name: newVarName, price: Number(newVarPrice) }]);
        setNewVarName('');
        setNewVarPrice('');
     }
  };

  const handleRemoveVariant = (idx: number) => {
     setVariants(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddRecipeItem = () => {
     if (newRecipeIngId && newRecipeAmount) {
        const amt = Number(newRecipeAmount);
        if (amt > 0) {
            setRecipe([...recipe, { ingredientId: newRecipeIngId, amount: amt }]);
            setNewRecipeIngId('');
            setNewRecipeAmount('');
        }
     }
  };

  const handleRemoveRecipeItem = (idx: number) => {
      setRecipe(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveProduct = async () => {
    try {
      if (editingProduct) {
         await updateDoc(doc(db, `stores/${storeId}/products`, editingProduct.id), {
            name, category, price: Number(price), stock: Number(stock), isVariant, variants, isRecipe, recipe
         });
      } else {
         await addDoc(collection(db, `stores/${storeId}/products`), {
            name, category, price: Number(price), stock: Number(stock), isVariant, variants, isRecipe, recipe
         });
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert("Gagal menyimpan produk");
    }
  };

  const handleSaveIngredient = async () => {
     try {
        await addDoc(collection(db, `stores/${storeId}/ingredients`), {
           name: ingName, unit: ingUnit, stock: Number(ingStock)
        });
        onClose();
     } catch (e) { console.error(e); alert("Gagal simpan bahan"); }
  };

  return (
    <Modal title={editingProduct ? "Edit Produk" : "Tambah Item Baru"} onClose={onClose}>
      <div className="space-y-4">
        {!editingProduct && (
           <div className="flex gap-4 border-b border-slate-700 pb-2 mb-4">
             <button onClick={() => setActiveTab('product')} className={`font-bold ${activeTab === 'product' ? 'text-accent' : 'text-slate-500'}`}>Produk Jual</button>
             <button onClick={() => setActiveTab('ingredient')} className={`font-bold ${activeTab === 'ingredient' ? 'text-accent' : 'text-slate-500'}`}>Bahan Baku</button>
           </div>
        )}

        {activeTab === 'product' ? (
           <div className="space-y-3">
             <input type="text" placeholder="Nama Produk" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={name} onChange={e => setName(e.target.value)} />
             <div className="grid grid-cols-2 gap-2">
               <input type="text" placeholder="Kategori" className="bg-slate-900 border border-slate-700 rounded p-2 text-white" value={category} onChange={e => setCategory(e.target.value)} />
               {!isVariant && <input type="number" placeholder="Harga Dasar" className="bg-slate-900 border border-slate-700 rounded p-2 text-white" value={price} onChange={e => setPrice(Number(e.target.value))} />}
             </div>
             
             {/* Options */}
             <div className="flex gap-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                   <input type="checkbox" checked={isVariant} onChange={e => setIsVariant(e.target.checked)} />
                   <span className="text-sm">Produk Varian (Panas/Dingin)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                   <input type="checkbox" checked={isRecipe} onChange={e => setIsRecipe(e.target.checked)} />
                   <span className="text-sm">Produk Racikan (Resep)</span>
                </label>
             </div>

             {/* Dynamic Fields */}
             {isVariant && (
                <div className="bg-slate-900 p-3 rounded border border-slate-700">
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-300">Daftar Varian Harga</span>
                   </div>
                   
                   {/* Inline Input for New Variant */}
                   <div className="flex gap-2 mb-3">
                      <input 
                        type="text" 
                        placeholder="Nama (e.g. Panas)" 
                        className="flex-1 bg-slate-800 border border-slate-600 rounded p-1 text-xs text-white"
                        value={newVarName}
                        onChange={(e) => setNewVarName(e.target.value)}
                      />
                      <input 
                        type="number" 
                        placeholder="Harga" 
                        className="w-24 bg-slate-800 border border-slate-600 rounded p-1 text-xs text-white"
                        value={newVarPrice}
                        onChange={(e) => setNewVarPrice(e.target.value)}
                      />
                      <button 
                        onClick={handleAddVariant} 
                        disabled={!newVarName || !newVarPrice}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 rounded font-bold disabled:opacity-50"
                      >
                        +
                      </button>
                   </div>

                   {variants.map((v, i) => (
                      <div key={i} className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 py-1">
                         <div className="flex gap-2">
                             <span>{v.name}</span>
                             <span className="font-bold">Rp {v.price}</span>
                         </div>
                         <button onClick={() => handleRemoveVariant(i)} className="text-red-400 hover:text-white p-1">
                             <X size={14} />
                         </button>
                      </div>
                   ))}
                </div>
             )}

             {isRecipe ? (
                <div className="bg-slate-900 p-3 rounded border border-slate-700">
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-300">Resep Racikan</span>
                   </div>

                   {/* Inline Input for New Recipe Item */}
                   <div className="flex gap-2 mb-3">
                      <select 
                         className="flex-1 bg-slate-800 border border-slate-600 rounded p-1 text-xs text-white"
                         value={newRecipeIngId}
                         onChange={(e) => setNewRecipeIngId(e.target.value)}
                      >
                         <option value="">-- Pilih Bahan --</option>
                         {ingredients.map(ing => (
                             <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                         ))}
                      </select>
                      <input 
                         type="number" 
                         placeholder="Jml" 
                         className="w-20 bg-slate-800 border border-slate-600 rounded p-1 text-xs text-white"
                         value={newRecipeAmount}
                         onChange={(e) => setNewRecipeAmount(e.target.value)}
                      />
                       <button 
                        onClick={handleAddRecipeItem} 
                        disabled={!newRecipeIngId || !newRecipeAmount}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-3 rounded font-bold disabled:opacity-50"
                      >
                        +
                      </button>
                   </div>

                   {recipe.map((r, i) => (
                      <div key={i} className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 py-1">
                         <span>{ingredients.find(ing => ing.id === r.ingredientId)?.name || r.ingredientId}</span>
                         <div className="flex items-center gap-2">
                            <span>{r.amount} {ingredients.find(ing => ing.id === r.ingredientId)?.unit}</span>
                            <button onClick={() => handleRemoveRecipeItem(i)} className="text-red-400 hover:text-white p-1">
                                <X size={14} />
                            </button>
                         </div>
                      </div>
                   ))}
                   <p className="text-[10px] text-slate-500 mt-2">*Stok akan otomatis terpotong dari bahan baku</p>
                </div>
             ) : (
                <div className="bg-slate-900 p-3 rounded border border-slate-700">
                   <label className="text-sm text-slate-400">Stok Produk Jadi</label>
                   <input type="number" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white mt-1" value={stock} onChange={e => setStock(Number(e.target.value))} />
                </div>
             )}

             <button onClick={handleSaveProduct} className="w-full bg-accent hover:bg-emerald-600 text-primary font-bold py-3 rounded mt-2">Simpan Produk</button>
           </div>
        ) : (
           <div className="space-y-3">
             <input type="text" placeholder="Nama Bahan Baku (e.g. Kopi Bubuk)" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={ingName} onChange={e => setIngName(e.target.value)} />
             <div className="grid grid-cols-2 gap-2">
                <select className="bg-slate-900 border border-slate-700 rounded p-2 text-white" value={ingUnit} onChange={e => setIngUnit(e.target.value)}>
                   <option value="gram">Gram</option>
                   <option value="ml">Milliliter</option>
                   <option value="pcs">Pcs</option>
                   <option value="kg">Kg</option>
                </select>
                <input type="number" placeholder="Stok Awal" className="bg-slate-900 border border-slate-700 rounded p-2 text-white" value={ingStock} onChange={e => setIngStock(Number(e.target.value))} />
             </div>
             <button onClick={handleSaveIngredient} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded mt-2">Simpan Bahan</button>
           </div>
        )}
      </div>
    </Modal>
  );
};

// --- Transaction History Screen ---
const TransactionHistoryScreen: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
   const [selectedTrans, setSelectedTrans] = useState<Transaction | null>(null);

   return (
      <div className="h-full flex flex-col">
         <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Receipt className="text-slate-400" /> Riwayat Transaksi
         </h2>
         
         <div className="bg-secondary rounded-xl border border-slate-700 overflow-hidden flex-1 overflow-y-auto">
            <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
               <thead className="bg-slate-800 text-slate-400 text-sm sticky top-0">
                  <tr>
                     <th className="p-4">Waktu</th>
                     <th className="p-4">ID</th>
                     <th className="p-4">Kasir</th>
                     <th className="p-4">Pelanggan</th>
                     <th className="p-4">Tipe</th>
                     <th className="p-4 text-right">Total</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-700">
                  {transactions.map(t => (
                     <tr key={t.id} onClick={() => setSelectedTrans(t)} className="hover:bg-slate-800/50 cursor-pointer">
                        <td className="p-4 text-slate-300">{new Date(t.date).toLocaleString()}</td>
                        <td className="p-4 text-xs font-mono text-slate-500">#{t.id.slice(-4)}</td>
                        <td className="p-4 text-slate-300">{t.cashierName}</td>
                        <td className="p-4 text-slate-300 font-bold">{t.customerName || '-'}</td>
                        <td className="p-4">
                           <span className={`text-[10px] px-2 py-1 rounded uppercase font-bold ${t.type === 'mixed' ? 'bg-purple-900/30 text-purple-400' : 'bg-slate-700 text-slate-400'}`}>
                              {t.type}
                           </span>
                        </td>
                        <td className="p-4 text-right font-bold text-accent">Rp {t.total.toLocaleString()}</td>
                     </tr>
                  ))}
               </tbody>
            </table>
            </div>
         </div>

         {selectedTrans && (
            <Modal title="Detail Transaksi" onClose={() => setSelectedTrans(null)}>
               <div className="space-y-4">
                  <div className="text-center border-b border-slate-700 pb-4 mb-2 border-dashed">
                     <h3 className="font-bold text-xl text-white">Zyra Billiard & Kopi</h3>
                     <p className="text-xs text-slate-400">Jln Raya Depan karangtinggil - Pucuk</p>
                     <p className="text-xs text-slate-500 mt-2">{new Date(selectedTrans.date).toLocaleString()}</p>
                     <p className="text-xs text-slate-500">Kasir: {selectedTrans.cashierName}</p>
                     <p className="text-xs text-slate-500">Pelanggan: {selectedTrans.customerName}</p>
                  </div>
                  
                  <div className="space-y-2">
                     {selectedTrans.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                           <div>
                              <span className="text-white">{item.name}</span>
                              <div className="text-xs text-slate-500">{item.quantity} x {item.price.toLocaleString()}</div>
                           </div>
                           <span className="text-white font-mono">{(item.quantity * item.price).toLocaleString()}</span>
                        </div>
                     ))}
                  </div>

                  <div className="border-t border-slate-700 pt-2 mt-2 border-dashed">
                     <div className="flex justify-between font-bold text-lg text-white">
                        <span>Total</span>
                        <span>Rp {selectedTrans.total.toLocaleString()}</span>
                     </div>
                     <div className="flex justify-between text-sm text-slate-400 mt-1">
                        <span>Bayar</span>
                        <span>Rp {selectedTrans.amountReceived?.toLocaleString()}</span>
                     </div>
                     <div className="flex justify-between text-sm text-slate-400">
                        <span>Kembali</span>
                        <span>Rp {selectedTrans.change?.toLocaleString()}</span>
                     </div>
                  </div>
               </div>
            </Modal>
         )}
      </div>
   );
};

// --- Settings Screen (Admin Only) ---
const SettingsScreen: React.FC<{ storeId: string, users: User[], operators: Operator[] }> = ({ storeId, users, operators }) => {
  const [newOpName, setNewOpName] = useState('');
  const [opToDelete, setOpToDelete] = useState<Operator | null>(null);

  // Store Settings State
  const [settings, setSettings] = useState<Partial<StoreSettings>>({
     name: '', address: '', logoUrl: '', openingHours: '', wifiPassword: '', tiktok: '', whatsapp: '', footerNote: ''
  });
  const [loadingSettings, setLoadingSettings] = useState(false);

  useEffect(() => {
     const fetchSettings = async () => {
        const docRef = doc(db, 'stores', storeId);
        const snap = await getDoc(docRef);
        if(snap.exists()) {
           setSettings(prev => ({ ...prev, ...snap.data() }));
        }
     }
     fetchSettings();
  }, [storeId]);

  const handleSaveSettings = async () => {
     setLoadingSettings(true);
     try {
        await updateDoc(doc(db, 'stores', storeId), settings);
        alert("Pengaturan Toko berhasil disimpan!");
     } catch(e) { console.error(e); alert("Gagal menyimpan pengaturan."); }
     finally { setLoadingSettings(false); }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if(file) {
        if(file.size > 500 * 1024) { // 500KB Limit
           alert("Ukuran file logo maksimal 500KB");
           return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
           setSettings(prev => ({ ...prev, logoUrl: reader.result as string }));
        }
        reader.readAsDataURL(file);
     }
  }

  const handleAddOperator = async () => {
     if(!newOpName) return;
     try {
        await addDoc(collection(db, `stores/${storeId}/operators`), { name: newOpName });
        setNewOpName('');
     } catch (e) {
        console.error(e);
        alert("Gagal menambah operator");
     }
  };

  const confirmDeleteOperator = async () => {
     if(!opToDelete) return;
     try {
        await deleteDoc(doc(db, `stores/${storeId}/operators`, opToDelete.id));
        setOpToDelete(null);
     } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Settings className="text-slate-400" /> Pengaturan
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. Store & Receipt Settings */}
        <div className="bg-secondary p-6 rounded-xl border border-slate-700 h-fit lg:col-span-2">
           <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
               <h3 className="font-bold flex items-center gap-2 text-lg"><Store size={20} className="text-accent" /> Pengaturan Toko & Struk</h3>
               <BluetoothPrinter />
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-4">
                  {/* Logo Upload */}
                  <div className="flex items-center gap-4">
                     <div className="w-20 h-20 bg-slate-800 rounded-lg border border-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                        {settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" /> : <Store size={32} className="text-slate-600" />}
                     </div>
                     <div>
                        <label className="block text-sm font-bold text-slate-300 mb-1">Logo Toko (Header Struk)</label>
                        <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-xs text-white flex items-center gap-2 w-fit">
                           <Upload size={14} /> Upload Gambar
                           <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                        <p className="text-[10px] text-slate-500 mt-1">Maks. 500KB</p>
                     </div>
                  </div>

                  <div>
                     <label className="block text-xs text-slate-400 mb-1">Nama Usaha</label>
                     <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={settings.name || ''} onChange={e => setSettings({...settings, name: e.target.value})} />
                  </div>
                  <div>
                     <label className="block text-xs text-slate-400 mb-1">Alamat Lengkap</label>
                     <textarea className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" rows={2} value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} />
                  </div>
               </div>

               <div className="space-y-4">
                   <div>
                     <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Clock size={12}/> Info Buka - Tutup</label>
                     <input type="text" placeholder="e.g. Buka Setiap Hari (10.00 - 02.00)" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={settings.openingHours || ''} onChange={e => setSettings({...settings, openingHours: e.target.value})} />
                  </div>
                  <div>
                     <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Wifi size={12}/> Password WiFi</label>
                     <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={settings.wifiPassword || ''} onChange={e => setSettings({...settings, wifiPassword: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <div>
                        <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Instagram size={12}/> TikTok/IG</label>
                        <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={settings.tiktok || ''} onChange={e => setSettings({...settings, tiktok: e.target.value})} />
                     </div>
                     <div>
                        <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1"><Phone size={12}/> WhatsApp</label>
                        <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={settings.whatsapp || ''} onChange={e => setSettings({...settings, whatsapp: e.target.value})} />
                     </div>
                  </div>
                  <div>
                     <label className="block text-xs text-slate-400 mb-1">Catatan Kaki (Footer Struk)</label>
                     <input type="text" placeholder="e.g. Terimakasih atas kunjungan anda!" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm" value={settings.footerNote || ''} onChange={e => setSettings({...settings, footerNote: e.target.value})} />
                  </div>
               </div>
           </div>

           <div className="mt-6 flex justify-end">
              <button onClick={handleSaveSettings} disabled={loadingSettings} className="bg-accent hover:bg-emerald-600 text-primary font-bold px-6 py-2 rounded flex items-center gap-2 w-full sm:w-auto justify-center">
                 {loadingSettings ? 'Menyimpan...' : <><Save size={18}/> Simpan Pengaturan</>}
              </button>
           </div>
        </div>

        {/* 2. User Accounts */}
        <div className="bg-secondary p-6 rounded-xl border border-slate-700 h-fit">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Users size={20} /> Akun Login</h3>
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="flex justify-between items-center bg-slate-800 p-3 rounded">
                <div>
                  <p className="font-bold text-white">{u.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{u.role}</p>
                  <div className="font-mono bg-slate-900 px-2 py-1 rounded text-xs text-slate-500">PIN: {u.pin}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditUser(u)} className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs">Edit</button>
                  <button onClick={() => setDeleteUser(u)} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Hapus</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-700 pt-4">
            <h4 className="font-bold mb-2 text-sm">Tambah Akun Login</h4>
            <div className="flex flex-col gap-2">
              <input type="text" className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" placeholder="Nama" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
              <input type="text" className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" placeholder="PIN" value={newUserPin} onChange={e => setNewUserPin(e.target.value)} />
              <select className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" value={newUserRole} onChange={e => setNewUserRole(e.target.value as Role)}>
                <option value="admin">Admin</option>
                <option value="cashier">Kasir</option>
              </select>
              <button onClick={handleAddUser} className="bg-accent hover:bg-emerald-600 text-primary font-bold px-3 py-2 rounded">Tambah</button>
            </div>
          </div>
          {/* Edit Modal */}
          {editUser && (
            <Modal title="Edit Akun Login" onClose={() => setEditUser(null)}>
              <div className="space-y-3">
                <input type="text" className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" placeholder="Nama" value={editUserName} onChange={e => setEditUserName(e.target.value)} />
                <input type="text" className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" placeholder="PIN" value={editUserPin} onChange={e => setEditUserPin(e.target.value)} />
                <select className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-sm" value={editUserRole} onChange={e => setEditUserRole(e.target.value as Role)}>
                  <option value="admin">Admin</option>
                  <option value="cashier">Kasir</option>
                </select>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditUser(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded">Batal</button>
                  <button onClick={handleEditUser} className="flex-1 bg-accent hover:bg-emerald-600 text-primary py-2 rounded font-bold">Simpan</button>
                </div>
              </div>
            </Modal>
          )}
          {/* Delete Modal */}
          {deleteUser && (
            <Modal title="Hapus Akun Login" onClose={() => setDeleteUser(null)}>
              <div className="space-y-4">
                <p className="text-slate-300">Anda yakin ingin menghapus akun <span className="text-white font-bold">{deleteUser.name}</span>?</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteUser(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded">Batal</button>
                  <button onClick={handleDeleteUser} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded">Hapus</button>
                </div>
              </div>
            </Modal>
          )}
        </div>

        {/* 3. Shift Operators */}
        <div className="bg-secondary p-6 rounded-xl border border-slate-700 h-fit">
           <h3 className="font-bold mb-4 flex items-center gap-2"><UserPlus size={20} /> Nama Operator Shift</h3>
           <p className="text-xs text-slate-400 mb-4">Daftar nama ini akan muncul saat Kasir memulai shift.</p>
           
           <div className="flex gap-2 mb-4">
              <input 
                 type="text" 
                 value={newOpName}
                 onChange={(e) => setNewOpName(e.target.value)}
                 className="flex-1 bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"
                 placeholder="Nama baru (e.g. Budi)"
              />
              <button onClick={handleAddOperator} className="bg-blue-600 hover:bg-blue-700 px-3 rounded text-white font-bold">+</button>
           </div>

           <div className="space-y-2 max-h-60 overflow-y-auto">
              {operators.map(op => (
                 <div key={op.id} className="flex justify-between items-center bg-slate-800 p-2 rounded px-3">
                    <span className="text-sm font-medium">{op.name}</span>
                    <button onClick={() => setOpToDelete(op)} className="text-red-400 hover:text-white p-1">
                       <XCircle size={18} />
                    </button>
                 </div>
              ))}
              {operators.length === 0 && <p className="text-center text-slate-500 text-xs py-2">Belum ada data operator.</p>}
           </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {opToDelete && (
        <Modal title="Hapus Operator" onClose={() => setOpToDelete(null)}>
           <div className="space-y-4">
              <p className="text-slate-300">Anda yakin ingin menghapus nama operator <span className="text-white font-bold">{opToDelete.name}</span>?</p>
              <div className="flex gap-2">
                 <button onClick={() => setOpToDelete(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded">Batal</button>
                 <button onClick={confirmDeleteOperator} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded">Hapus</button>
              </div>
           </div>
        </Modal>
      )}
    </div>
  );
};

// --- Checkout Modal ---
interface CheckoutModalProps {
  storeId: string;
  cart: CartItem[];
  currentUser: User;
  products: Product[];
  ingredients: Ingredient[];
  tables: Table[];
  activeOperator?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ storeId, cart, currentUser, products, ingredients, tables, activeOperator, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [cashReceived, setCashReceived] = useState<number>(0);
  
  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const change = Math.max(0, cashReceived - total);
  const canPay = customerName.length > 0 && cashReceived >= total;

  const handleProcessPayment = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const batchPromises = [];
      const transactionRef = doc(collection(db, `stores/${storeId}/transactions`));
      
      const safeCart = cart.map(item => ({
        ...item,
        productId: item.productId || null,
        tableId: item.tableId || null,
        variantType: item.variantType || null,
        isRecipe: item.isRecipe || false,
        duration: item.duration || 0
      }));

      // 1. Save Transaction
      batchPromises.push(setDoc(transactionRef, {
        date: Date.now(),
        type: cart.some(i => i.itemType === 'table') && cart.some(i => i.itemType === 'product') ? 'mixed' : cart[0].itemType === 'table' ? 'rental' : 'sale',
        items: safeCart,
        total: total,
        cashierName: activeOperator || currentUser.name,
        customerName: customerName,
        amountReceived: cashReceived,
        change: change,
        paymentMethod: 'cash'
      }));

      // 2. Process Items
      for (const item of cart) {
        // A. Handle Products
        if (item.itemType === 'product' && item.productId) {
           const product = products.find(p => p.id === item.productId);
           if (!product) continue;

           if (product.isRecipe && product.recipe) {
              // Deduct ingredients
              for (const r of product.recipe) {
                 const ing = ingredients.find(i => i.id === r.ingredientId);
                 if (ing) {
                    const newStock = Math.max(0, ing.stock - (r.amount * item.quantity));
                    batchPromises.push(updateDoc(doc(db, `stores/${storeId}/ingredients`, ing.id), { stock: newStock }));
                 }
              }
           } else {
              // Deduct direct stock
              const newStock = Math.max(0, product.stock - item.quantity);
              batchPromises.push(updateDoc(doc(db, `stores/${storeId}/products`, item.productId), { stock: newStock }));
           }
        }
        
        // B. Handle Tables
        if (item.itemType === 'table' && item.tableId) {
           const table = tables.find(t => t.id === item.tableId);
           if (table) {
              const isTopup = table.status === 'occupied';
              const durationMs = (item.duration || 60) * 60 * 1000;
              
              let newData;
              if (isTopup) {
                 newData = {
                    endTime: (table.endTime || Date.now()) + durationMs,
                    duration: (table.duration || 0) + (item.duration || 0)
                 };
              } else {
                 newData = {
                    status: 'occupied',
                    startTime: Date.now(),
                    duration: item.duration || 60,
                    endTime: Date.now() + durationMs,
                    currentCustomer: customerName
                 };
              }
              batchPromises.push(updateDoc(doc(db, `stores/${storeId}/tables`, item.tableId), newData));
           }
        }
      }

      await Promise.all(batchPromises);

      // After DB updates, command device to turn ON lamps for occupied tables (with duration)
      try {
        const tableIds = Array.from(new Set(cart.filter(i => i.itemType === 'table' && i.tableId).map(i => (i as CartItem).tableId as string)));
        const promises = tableIds.map(async (tid) => {
          try {
            const tableDoc = await getDoc(doc(db, `stores/${storeId}/tables`, tid));
            if (!tableDoc.exists()) return;
            const tdata = tableDoc.data() as Table;
            if (tdata.status === 'occupied') {
              const num = deriveTableNumber(tdata.name, tables.findIndex(x => x.id === tid));
              const dur = tdata.endTime ? Math.max(0, Math.ceil((tdata.endTime - Date.now()) / 1000)) : undefined;
              return controlLamp(num, 'on', dur);
            }
          } catch (e) {
            console.warn('Failed to command lamp for table', tid, e);
          }
        });
        // Fire-and-forget: don't block user flow, but log failures
        Promise.allSettled(promises).then(results => {
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r as any).value?.ok));
          if (failed.length > 0) console.warn('Some lamp commands failed', failed);
        });
      } catch (err) {
        console.error('Lamp control error', err);
      }

      alert(`Pembayaran Berhasil!\nKembalian: Rp ${change.toLocaleString()}`);
      onSuccess();

    } catch (e: any) {
      console.error(e);
      alert(`Gagal memproses pembayaran: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Checkout - Pembayaran" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-slate-800 p-2 rounded text-sm text-slate-300 flex justify-between">
           <span>Operator: <span className="font-bold text-white">{activeOperator || currentUser.name}</span></span>
        </div>

        <div>
           <label className="block text-sm text-slate-400 mb-1">Nama Pelanggan (Wajib)</label>
           <input 
              type="text" 
              placeholder="Masukkan Nama Pelanggan" 
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white placeholder-slate-600 focus:border-accent outline-none"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
           />
        </div>

        <div className="bg-slate-900 p-4 rounded border border-slate-700">
           <div className="flex justify-between items-center mb-4">
              <span className="text-slate-400">Total Tagihan</span>
              <span className="text-2xl font-bold text-white">Rp {total.toLocaleString()}</span>
           </div>
           
           <div className="mb-2">
              <label className="block text-xs text-slate-400 mb-1">Uang Diterima</label>
              <input 
                 type="number" 
                 className="w-full bg-slate-800 border border-slate-600 rounded p-3 text-white font-mono text-xl text-right focus:border-accent outline-none"
                 placeholder="0"
                 value={cashReceived || ''}
                 onChange={(e) => setCashReceived(Number(e.target.value))}
              />
           </div>

           <div className="flex gap-2 mb-4 justify-end overflow-x-auto pb-1 scrollbar-hide">
              {[total, 10000, 20000, 50000, 100000].map(amt => (
                 <button 
                   key={amt}
                   onClick={() => setCashReceived(amt)}
                   className="text-xs bg-slate-700 px-3 py-1 rounded text-slate-300 hover:text-white hover:bg-slate-600 border border-slate-600 whitespace-nowrap"
                 >
                    {amt === total ? 'Uang Pas' : `${amt/1000}k`}
                 </button>
              ))}
           </div>

           <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <span className="text-sm text-emerald-400">Kembalian:</span>
              <span className="text-xl font-bold text-emerald-400">Rp {change.toLocaleString()}</span>
           </div>
        </div>

        <button 
          onClick={handleProcessPayment}
          disabled={!canPay || loading}
          className="w-full bg-accent hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-primary font-bold py-4 rounded-lg text-lg transition flex items-center justify-center gap-2"
        >
           {loading ? 'Memproses...' : 'PROSES BAYAR'}
        </button>
      </div>
    </Modal>
  );
};
