
export type Role = 'admin' | 'cashier';

export interface User {
  id: string;
  name: string;
  pin: string;
  role: Role;
}

export interface Operator {
  id: string;
  name: string;
}

export interface Variant {
  name: string;
  price: number;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string; // e.g. 'gram', 'ml', 'pcs', 'kg'
  stock: number;
}

export interface RecipeItem {
  ingredientId: string;
  amount: number; // Amount used per serving
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number; // Base price if no variants
  stock: number; // For direct items (e.g. Sachet, Snacks)
  isVariant: boolean;
  variants?: Variant[]; // Array of custom variants
  isRecipe?: boolean; // True if stock is calculated from ingredients
  recipe?: RecipeItem[]; // List of ingredients used
}

export interface Table {
  id: string;
  name: string;
  status: 'available' | 'occupied';
  startTime?: number; // Timestamp
  duration?: number; // Minutes
  endTime?: number; // Timestamp
  remoteUrl?: string; // Arduino link
  remoteOn?: string; // explicit ON URL (optional)
  remoteOff?: string; // explicit OFF URL (optional)
  remoteToggle?: string; // explicit TOGGLE URL (optional)
  costPerHour: number;
  currentCustomer?: string; // Track who is playing
}

export interface CartItem {
  itemType: 'product' | 'table'; // Discriminator
  productId?: string; // For products
  tableId?: string; // For tables
  name: string;
  price: number;
  quantity: number;
  variantType?: string;
  isRecipe?: boolean;
  duration?: number; // For tables (minutes)
}

export interface Transaction {
  id: string;
  date: number; // Timestamp
  type: 'sale' | 'rental' | 'mixed';
  items: CartItem[];
  total: number;
  cashierName: string;
  customerName: string; // New: Customer Name
  amountReceived: number; // New: Cash given
  change: number; // New: Change returned
  paymentMethod: 'cash' | 'qris';
}

export interface StoreSettings {
  storeId: string;
  name: string;
  address: string;
  printerName?: string;
  // Receipt Fields
  logoUrl?: string; // Base64 string
  openingHours?: string;
  wifiPassword?: string;
  tiktok?: string;
  whatsapp?: string;
  footerNote?: string;
}

export interface Shift {
  operatorName: string;
  startTime: number;
  startCash: number;
}
