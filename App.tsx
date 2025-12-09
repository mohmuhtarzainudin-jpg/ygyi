import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Coffee, 
  Target, 
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
  X,
  ChevronRight
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

async function controlLampForTable(table: Table, action: 'on' | 'off' | 'toggle' = 'toggle', durationSec?: number) {
  try {
    let url: string | undefined;
    if (action === 'on' && table.remoteOn) url = table.remoteOn;
    else if (action === 'off' && table.remoteOff) url = table.remoteOff;
    else if (action === 'toggle' && table.remoteToggle) url = table.remoteToggle;

    if (url) {
      if (durationSec && durationSec > 0) {
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

    const inferredNum = deriveTableNumber(table.name, 0);
    return controlLamp(inferredNum, action, durationSec);
  } catch (e: any) {
    return { ok: false, error: String(e) };
  }
}

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
            <p className="text-red-400">Terjadi kesalahan. Cek console untuk detil.</p>
            <pre className="text-xs mt-2 text-slate-300 overflow-auto max-h-40">{String(this.state.error)}</pre>
          </div>
        </Modal>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

// --- Main App Component ---

const App: React.FC = () => {
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
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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
        setConnectError("Izin Database Ditolak. Cek Firebase Console > Rules.");
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

  useEffect(() => {
    if (!storeId) return;
    const iv = setInterval(() => {
      const now = Date.now();
      tables.forEach(async (t) => {
        try {
          if (t.status === 'occupied' && t.endTime && now >= t.endTime) {
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
    }, 15 * 1000);
    return () => clearInterval(iv);
  }, [tables, storeId]);

  // --- Handlers ---

  const addToCartProduct = (product: Product, price: number, variantType?: string) => {
    if (!product.isRecipe && product.stock <= 0) {
      alert("Stok Habis!");
      return;
    }

    setCart(prev => {
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
    setShowMobileMenu(false);
  };

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

  const handleCheckout = async (customerName: string, paymentMethod: 'cash' | 'qris', amountReceived: number) => {
    if (!storeId || !currentUser) return;
    
    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const change = amountReceived - total;

    if (paymentMethod === 'cash' && change < 0) {
      alert("Uang tunai kurang!");
      return;
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Create Transaction Record
        const newTransRef = doc(collection(db, `stores/${storeId}/transactions`));
        transaction.set(newTransRef, {
          date: Date.now(),
          type: cart.some(i => i.itemType === 'table') ? 'mixed' : 'sale',
          items: cart,
          total,
          cashierName: currentUser.name,
          customerName,
          amountReceived,
          change,
          paymentMethod
        });

        // 2. Update Inventory & Tables
        for (const item of cart) {
          if (item.itemType === 'product' && item.productId) {
            if (!item.isRecipe) {
              const prodRef = doc(db, `stores/${storeId}/products`, item.productId);
              const prodSnap = await transaction.get(prodRef);
              if (prodSnap.exists()) {
                const currentStock = prodSnap.data().stock || 0;
                transaction.update(prodRef, { stock: currentStock - item.quantity });
              }
            }
            // Handle recipe deduction logic here if needed (complex)
          } else if (item.itemType === 'table' && item.tableId && item.duration) {
            const tableRef = doc(db, `stores/${storeId}/tables`, item.tableId);
            const tableSnap = await transaction.get(tableRef);
            if (tableSnap.exists()) {
              const tData = tableSnap.data() as Table;
              const now = Date.now();
              let newEndTime = now + (item.duration * 60 * 1000);
              
              if (tData.status === 'occupied' && tData.endTime) {
                // Topup
                newEndTime = tData.endTime + (item.duration * 60 * 1000);
              }

              transaction.update(tableRef, {
                status: 'occupied',
                startTime: tData.status === 'available' ? now : tData.startTime,
                endTime: newEndTime,
                duration: (tData.duration || 0) + item.duration,
                currentCustomer: customerName
              });
            }
          }
        }
      });

      setCart([]);
      setIsCheckoutOpen(false);
      alert("Transaksi Berhasil!");
    } catch (error) {
      console.error("Checkout failed", error);
      alert("Transaksi Gagal: " + error);
    } finally {
      setLoading(false);
    }
  };

  // --- Render Components ---

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

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold text-white mb-4">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-secondary p-6 rounded-xl border border-slate-700">
                <h3 className="text-slate-400 text-sm mb-1">Total Penjualan (30 Hari)</h3>
                <p className="text-3xl font-bold text-accent">
                  Rp {transactions.reduce((acc, t) => acc + t.total, 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-secondary p-6 rounded-xl border border-slate-700">
                <h3 className="text-slate-400 text-sm mb-1">Transaksi</h3>
                <p className="text-3xl font-bold text-white">{transactions.length}</p>
              </div>
              <div className="bg-secondary p-6 rounded-xl border border-slate-700">
                <h3 className="text-slate-400 text-sm mb-1">Meja Aktif</h3>
                <p className="text-3xl font-bold text-blue-400">
                  {tables.filter(t => t.status === 'occupied').length} / {tables.length}
                </p>
              </div>
            </div>
            
            <div className="bg-secondary p-4 rounded-xl border border-slate-700 h-80">
              <h3 className="text-white font-bold mb-4">Grafik Penjualan</h3>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={transactions.slice(0, 10).reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString()} stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                    labelFormatter={(l) => new Date(l).toLocaleString()}
                  />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'billiard':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Kontrol Meja</h2>
              <div className="flex gap-2">
                <button onClick={() => controlLamp(0, 'off')} className="bg-red-900/50 text-red-200 px-3 py-1 rounded text-sm border border-red-800 hover:bg-red-900">
                  Matikan Semua Lampu
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {tables.map((table) => {
                const isOccupied = table.status === 'occupied';
                const timeLeft = table.endTime ? Math.max(0, Math.ceil((table.endTime - Date.now()) / 60000)) : 0;
                
                return (
                  <div key={table.id} className={`relative p-4 rounded-xl border-2 transition-all ${isOccupied ? 'bg-slate-800 border-accent shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-secondary border-slate-700 hover:border-slate-500'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white">{table.name}</h3>
                        <p className={`text-sm font-medium ${isOccupied ? 'text-accent' : 'text-slate-400'}`}>
                          {isOccupied ? `Dipakai: ${table.currentCustomer || 'Guest'}` : 'Tersedia'}
                        </p>
                      </div>
                      <div className={`w-3 h-3 rounded-full ${isOccupied ? 'bg-accent animate-pulse' : 'bg-slate-600'}`} />
                    </div>

                    {isOccupied ? (
                      <div className="space-y-3">
                        <div className="text-center py-2 bg-slate-900/50 rounded-lg border border-slate-700">
                          <span className="text-2xl font-mono font-bold text-white">{timeLeft}</span>
                          <span className="text-xs text-slate-400 block">Menit Tersisa</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => addToCartTable(table, 30)} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 py-2 rounded text-sm border border-blue-500/30">+30m</button>
                          <button onClick={() => addToCartTable(table, 60)} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 py-2 rounded text-sm border border-blue-500/30">+1h</button>
                        </div>
                        <button 
                          onClick={async () => {
                            if(confirm(`Stop ${table.name} sekarang?`)) {
                              await updateDoc(doc(db, `stores/${storeId}/tables`, table.id), {
                                status: 'available',
                                startTime: deleteField(),
                                endTime: deleteField(),
                                duration: 0,
                                currentCustomer: deleteField()
                              });
                              controlLampForTable(table, 'off');
                            }
                          }}
                          className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-400 py-2 rounded text-sm border border-red-800/50 flex items-center justify-center gap-2"
                        >
                          <StopCircle size={16} /> Stop & Matikan Lampu
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 mb-2">Pilih durasi main:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[30, 60, 120, 180].map(min => (
                            <button 
                              key={min}
                              onClick={() => addToCartTable(table, min)}
                              className="bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-sm transition"
                            >
                              {min} Menit
                            </button>
                          ))}
                        </div>
                        <button 
                          onClick={() => controlLampForTable(table, 'toggle')}
                          className="w-full mt-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-500 py-2 rounded text-sm border border-yellow-600/30 flex items-center justify-center gap-2"
                        >
                          <Power size={16} /> Tes Lampu
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'cafe':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold text-white mb-4">Menu Cafe</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(product => (
                <div key={product.id} className="bg-secondary p-4 rounded-xl border border-slate-700 hover:border-slate-500 transition group cursor-pointer"
                  onClick={() => {
                    if (!product.isVariant) addToCartProduct(product, product.price);
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-2 bg-slate-800 rounded-lg text-accent">
                      {product.category === 'food' ? <ChefHat size={20} /> : <Coffee size={20} />}
                    </div>
                    {!product.isRecipe && (
                      <span className={`text-xs px-2 py-1 rounded ${product.stock > 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                        Stok: {product.stock}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-white mb-1">{product.name}</h3>
                  
                  {product.isVariant ? (
                    <div className="space-y-1 mt-2">
                      {product.variants?.map((v, idx) => (
                        <button 
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCartProduct(product, v.price, v.name);
                          }}
                          className="w-full text-left text-xs bg-slate-800 hover:bg-slate-700 p-2 rounded flex justify-between text-slate-300"
                        >
                          <span>{v.name}</span>
                          <span>Rp {v.price.toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-accent font-bold">Rp {product.price.toLocaleString()}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );

      case 'inventory':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Inventory</h2>
              <button className="bg-accent text-primary px-4 py-2 rounded font-bold flex items-center gap-2">
                <Plus size={18} /> Tambah Produk
              </button>
            </div>
            <div className="bg-secondary rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-800 text-slate-200 uppercase font-bold">
                  <tr>
                    <th className="p-4">Nama Produk</th>
                    <th className="p-4">Kategori</th>
                    <th className="p-4">Harga</th>
                    <th className="p-4">Stok</th>
                    <th className="p-4">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/50">
                      <td className="p-4 font-medium text-white">{p.name}</td>
                      <td className="p-4">{p.category}</td>
                      <td className="p-4">
                        {p.isVariant ? 'Varian' : `Rp ${p.price.toLocaleString()}`}
                      </td>
                      <td className="p-4">
                        {p.isRecipe ? '-' : p.stock}
                      </td>
                      <td className="p-4 flex gap-2">
                        <button className="p-2 hover:bg-blue-900/30 text-blue-400 rounded"><Edit size={16}/></button>
                        <button className="p-2 hover:bg-red-900/30 text-red-400 rounded"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold text-white">Riwayat Transaksi</h2>
            <div className="bg-secondary rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-800 text-slate-200 uppercase font-bold">
                  <tr>
                    <th className="p-4">Waktu</th>
                    <th className="p-4">Kasir</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Metode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-slate-800/50">
                      <td className="p-4">{new Date(t.date).toLocaleString()}</td>
                      <td className="p-4">{t.cashierName}</td>
                      <td className="p-4">{t.customerName || '-'}</td>
                      <td className="p-4 text-accent font-bold">Rp {t.total.toLocaleString()}</td>
                      <td className="p-4 uppercase text-xs">{t.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h2 className="text-2xl font-bold text-white">Pengaturan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-secondary p-6 rounded-xl border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Store size={20}/> Info Toko</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Nama Toko</label>
                    <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" defaultValue="Zyra Billiard" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Alamat</label>
                    <textarea className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" rows={3} />
                  </div>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Simpan</button>
                </div>
              </div>
              
              <BluetoothPrinter />

              <div className="bg-secondary p-6 rounded-xl border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Users size={20}/> Manajemen User</h3>
                <div className="space-y-2">
                  {users.map(u => (
                    <div key={u.id} className="flex justify-between items-center bg-slate-800 p-3 rounded">
                      <div>
                        <p className="text-white font-medium">{u.name}</p>
                        <p className="text-xs text-slate-500 uppercase">{u.role}</p>
                      </div>
                      <div className="text-slate-400 font-mono">****</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-white">Halaman tidak ditemukan</div>;
    }
  };

  // --- Main Render ---

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
            <button onClick={() => setInputPin('')} className="bg-red-900/30 text-red-400 font-bold py-4 rounded-lg">C</button>
            <button onClick={() => setInputPin(prev => prev + '0')} className="bg-slate-800 text-white text-xl font-bold py-4 rounded-lg">0</button>
            <button onClick={handleLogin} className="bg-accent text-primary font-bold py-4 rounded-lg">OK</button>
          </div>
          
          <button onClick={() => { localStorage.removeItem(STORE_KEY); setStoreId(null); }} className="text-slate-500 text-sm hover:text-white underline">
            Ganti Store ID
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-primary overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex flex-col w-64 bg-secondary border-r border-slate-700">
          <div className="p-6 border-b border-slate-700">
            <h1 className="text-2xl font-bold text-accent tracking-tight">ZYRA POS</h1>
            <p className="text-xs text-slate-400 mt-1">Billiard & Cafe System</p>
          </div>
          
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'billiard', label: 'Billiard Control', icon: Target },
              { id: 'cafe', label: 'Cafe Menu', icon: Coffee },
              { id: 'inventory', label: 'Inventory', icon: Package },
              { id: 'history', label: 'Riwayat', icon: History },
              { id: 'settings', label: 'Pengaturan', icon: Settings },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === item.id 
                    ? 'bg-accent text-primary font-bold shadow-lg shadow-accent/20' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                {currentUser.name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-400 capitalize">{currentUser.role}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-red-400 hover:bg-red-900/20 py-2 rounded text-sm transition">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-secondary border-b border-slate-700 flex items-center justify-between px-4 z-40">
          <button onClick={() => setShowMobileMenu(true)} className="text-white p-2">
            <Menu size={24} />
          </button>
          <span className="font-bold text-white">Zyra POS</span>
          <button onClick={() => setShowMobileCart(true)} className="text-white p-2 relative">
            <ShoppingCart size={24} />
            {cart.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">
                {cart.length}
              </span>
            )}
          </button>
        </div>

        {/* Mobile Menu Drawer */}
        {showMobileMenu && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-secondary border-r border-slate-700 p-4 animate-in slide-in-from-left duration-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Menu</h2>
                <button onClick={() => setShowMobileMenu(false)} className="text-slate-400"><X size={24}/></button>
              </div>
              <nav className="space-y-2">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                  { id: 'billiard', label: 'Billiard', icon: Target },
                  { id: 'cafe', label: 'Cafe', icon: Coffee },
                  { id: 'inventory', label: 'Inventory', icon: Package },
                  { id: 'history', label: 'Riwayat', icon: History },
                  { id: 'settings', label: 'Settings', icon: Settings },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as any); setShowMobileMenu(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                      activeTab === item.id ? 'bg-accent text-primary font-bold' : 'text-slate-400'
                    }`}
                  >
                    <item.icon size={20} />
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="mt-auto pt-4 border-t border-slate-700 absolute bottom-4 left-4 right-4">
                <button onClick={handleLogout} className="w-full flex items-center gap-2 text-red-400">
                  <LogOut size={18} /> Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 md:pt-8 relative">
          {renderContent()}
        </main>

        {/* Cart Sidebar (Desktop) */}
        <aside className="hidden lg:flex flex-col w-80 bg-secondary border-l border-slate-700">
          <div className="p-4 border-b border-slate-700 font-bold text-white flex items-center gap-2">
            <ShoppingCart size={20} /> Current Order
          </div>
          <CartContent />
        </aside>

        {/* Mobile Cart Drawer */}
        {showMobileCart && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowMobileCart(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-secondary border-l border-slate-700 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                <h2 className="font-bold text-white flex items-center gap-2"><ShoppingCart size={20}/> Keranjang</h2>
                <button onClick={() => setShowMobileCart(false)} className="text-slate-400"><X size={24}/></button>
              </div>
              <CartContent />
            </div>
          </div>
        )}

        {/* Checkout Modal */}
        {isCheckoutOpen && (
          <Modal title="Pembayaran" onClose={() => setIsCheckoutOpen(false)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nama Pelanggan</label>
                <input id="custName" type="text" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="Nama..." />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Total Tagihan</label>
                <div className="text-2xl font-bold text-white">
                  Rp {cart.reduce((acc, i) => acc + (i.price * i.quantity), 0).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Uang Diterima</label>
                <input id="cashRec" type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button 
                  onClick={() => {
                    const name = (document.getElementById('custName') as HTMLInputElement).value || 'Guest';
                    const cash = Number((document.getElementById('cashRec') as HTMLInputElement).value);
                    handleCheckout(name, 'cash', cash);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded font-bold"
                >
                  Bayar Tunai
                </button>
                <button 
                  onClick={() => {
                    const name = (document.getElementById('custName') as HTMLInputElement).value || 'Guest';
                    const total = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);
                    handleCheckout(name, 'qris', total);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white py-3 rounded font-bold"
                >
                  QRIS / Transfer
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Shift Modal */}
        {showShiftModal && (
          <Modal title="Buka Shift Baru" onClose={() => {}}>
            <div className="space-y-4">
              <p className="text-slate-300">Halo, <span className="font-bold text-white">{currentUser.name}</span>. Silakan masukkan modal awal kasir.</p>
              <input 
                id="startCash" 
                type="number" 
                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white text-lg" 
                placeholder="Rp 0" 
              />
              <button 
                onClick={() => {
                  const cash = Number((document.getElementById('startCash') as HTMLInputElement).value);
                  handleStartShift(currentUser.name, cash);
                }}
                className="w-full bg-accent text-primary font-bold py-3 rounded"
              >
                Mulai Shift
              </button>
            </div>
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
