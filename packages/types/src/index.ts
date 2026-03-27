export type UserRole = 'admin' | 'sales' | 'inventory';

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stockQty: number;
  imageUrl: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  customerId: string;
  createdBy: string;
  totalAmount: number;
  status: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  orderId: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  details: unknown;
}

export interface ApiErrorResponse {
  error: ApiError;
}
