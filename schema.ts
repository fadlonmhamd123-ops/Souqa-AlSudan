import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============ USERS & RBAC ============ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 20 }).unique(),
    email: varchar("email", { length: 255 }).unique(),
    passwordHash: text("password_hash"),
    googleId: varchar("google_id", { length: 255 }).unique(),
    role: varchar("role", { length: 30 }).notNull().default("buyer"),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    emailVerified: boolean("email_verified").notNull().default(false),
    locale: varchar("locale", { length: 10 }).notNull().default("ar"),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    twoFaEnabled: boolean("two_fa_enabled").notNull().default(false),
    twoFaSecret: text("two_fa_secret"),
    otpFailedAttempts: integer("otp_failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_users_role").on(t.role), index("idx_users_phone").on(t.phone)]
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 30 }).notNull().unique(),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  permissions: jsonb("permissions").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_user_roles").on(t.userId, t.roleId)]
);

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 200 }),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  address: text("address"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  timezone: varchar("timezone", { length: 60 }).default("Africa/Khartoum"),
  language: varchar("language", { length: 10 }).default("ar"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const merchantProfiles = pgTable("merchant_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  businessName: varchar("business_name", { length: 255 }),
  businessType: varchar("business_type", { length: 100 }),
  nationalId: varchar("national_id", { length: 50 }),
  commercialReg: varchar("commercial_reg", { length: 100 }),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("0"),
  totalSales: numeric("total_sales", { precision: 18, scale: 2 }).notNull().default("0"),
  commissionDue: numeric("commission_due", { precision: 18, scale: 2 }).notNull().default("0"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const buyerProfiles = pgTable("buyer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  preferredState: varchar("preferred_state", { length: 100 }),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kycDocuments = pgTable("kyc_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 60 }).notNull(),
  fileUrl: text("file_url").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  notes: text("notes"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============ CATALOG ============ */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  imageUrl: text("image_url"),
  minImages: integer("min_images").notNull().default(1),
  requiresDeed: boolean("requires_deed").notNull().default(false),
  inspectionProfile: jsonb("inspection_profile").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    nameAr: varchar("name_ar", { length: 255 }).notNull(),
    nameEn: varchar("name_en", { length: 255 }),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    logoUrl: text("logo_url"),
    bannerUrl: text("banner_url"),
    state: varchar("state", { length: 100 }),
    city: varchar("city", { length: 100 }),
    address: text("address"),
    lat: numeric("lat", { precision: 10, scale: 7 }),
    lng: numeric("lng", { precision: 10, scale: 7 }),
    phone: varchar("phone", { length: 20 }),
    whatsapp: varchar("whatsapp", { length: 20 }),
    paymentInfo: jsonb("payment_info").notNull().default({}),
    locationSettings: jsonb("location_settings").notNull().default({}),
    communication: jsonb("communication").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_stores_merchant").on(t.merchantId)]
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id),
    titleAr: varchar("title_ar", { length: 300 }).notNull(),
    titleEn: varchar("title_en", { length: 300 }),
    descriptionAr: text("description_ar"),
    descriptionEn: text("description_en"),
    price: numeric("price", { precision: 18, scale: 2 }).notNull(),
    originalPrice: numeric("original_price", { precision: 18, scale: 2 }),
    isNegotiable: boolean("is_negotiable").notNull().default(false),
    minAcceptPrice: numeric("min_accept_price", { precision: 18, scale: 2 }),
    stockQty: integer("stock_qty").notNull().default(1),
    sku: varchar("sku", { length: 100 }),
    condition: varchar("condition", { length: 30 }).notNull().default("new"),
    specs: jsonb("specs").notNull().default({}),
    expiryDate: timestamp("expiry_date"),
    allergens: text("allergens"),
    deedUrl: text("deed_url"),
    status: varchar("status", { length: 40 }).notNull().default("draft"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
    inspectionNotes: text("inspection_notes"),
    riskScore: numeric("risk_score", { precision: 5, scale: 2 }).notNull().default("0"),
    priceHistory: jsonb("price_history").notNull().default([]),
    deliveryFee: numeric("delivery_fee", { precision: 18, scale: 2 }).notNull().default("0"),
    deliveryNegotiable: boolean("delivery_negotiable").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_products_store").on(t.storeId),
    index("idx_products_status").on(t.status),
    index("idx_products_category").on(t.categoryId),
  ]
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    imageHash: varchar("image_hash", { length: 128 }),
    isStockSuspected: boolean("is_stock_suspected").notNull().default(false),
    isAiSuspected: boolean("is_ai_suspected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_pimages_product").on(t.productId)]
);

export const productInspectionLogs = pgTable(
  "product_inspection_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    decision: varchar("decision", { length: 30 }).notNull(),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull(),
    checks: jsonb("checks").notNull().default([]),
    explanationAr: text("explanation_ar"),
    explanationEn: text("explanation_en"),
    reviewedBy: varchar("reviewed_by", { length: 60 }).notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_inspection_product").on(t.productId)]
);

/* ============ CART & ORDERS ============ */
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerId: uuid("buyer_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull().default(1),
    offeredPrice: numeric("offered_price", { precision: 18, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_cart_product").on(t.cartId, t.productId)]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 40 }).notNull().unique(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 40 }).notNull().default("PENDING"),
    subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
    deliveryFee: numeric("delivery_fee", { precision: 18, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 18, scale: 2 }).notNull().default("0"),
    commissionAmount: numeric("commission_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    commissionSettled: boolean("commission_settled").notNull().default(false),
    paymentMethod: varchar("payment_method", { length: 30 }).notNull().default("cash"),
    paymentStatus: varchar("payment_status", { length: 30 }).notNull().default("unpaid"),
    buyerState: varchar("buyer_state", { length: 100 }),
    merchantState: varchar("merchant_state", { length: 100 }),
    isCrossState: boolean("is_cross_state").notNull().default(false),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    warnedAt: timestamp("warned_at", { withTimezone: true }),
    penaltyApplied: boolean("penalty_applied").notNull().default(false),
    shippingAddress: jsonb("shipping_address").notNull().default({}),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_orders_buyer").on(t.buyerId),
    index("idx_orders_merchant").on(t.merchantId),
    index("idx_orders_status").on(t.status),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    title: varchar("title", { length: 300 }).notNull(),
    qty: integer("qty").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
    agreedPrice: numeric("agreed_price", { precision: 18, scale: 2 }),
    deliveryFeeShare: numeric("delivery_fee_share", { precision: 18, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("idx_orderitems_order").on(t.orderId)]
);

export const orderNegotiations = pgTable(
  "order_negotiations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => users.id),
    originalPrice: numeric("original_price", { precision: 18, scale: 2 }).notNull(),
    buyerOffer: numeric("buyer_offer", { precision: 18, scale: 2 }),
    merchantCounterOffer: numeric("merchant_counter_offer", { precision: 18, scale: 2 }),
    agreedPrice: numeric("agreed_price", { precision: 18, scale: 2 }),
    deliveryOffer: numeric("delivery_offer", { precision: 18, scale: 2 }),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_nego_order").on(t.orderId), index("idx_nego_product").on(t.productId)]
);

export const orderTimeline = pgTable(
  "order_timeline",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 40 }),
    toStatus: varchar("to_status", { length: 40 }).notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    actorRole: varchar("actor_role", { length: 30 }),
    note: text("note"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_timeline_order").on(t.orderId)]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").references(() => orders.id),
    payerId: uuid("payer_id").references(() => users.id),
    payeeId: uuid("payee_id").references(() => users.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    method: varchar("method", { length: 30 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    providerRef: varchar("provider_ref", { length: 200 }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_payments_order").on(t.orderId)]
);

/* ============ PAYMENT GATEWAYS (intents + webhook events) ============ */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    provider: varchar("provider", { length: 20 }).notNull(),
    purpose: varchar("purpose", { length: 20 }).notNull().default("wallet_topup"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("SDG"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    providerRef: varchar("provider_ref", { length: 200 }),
    phone: varchar("phone", { length: 20 }),
    metadata: jsonb("metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_payint_user").on(t.userId),
    index("idx_payint_order").on(t.orderId),
    index("idx_payint_status").on(t.status),
  ]
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 20 }).notNull(),
    eventId: varchar("event_id", { length: 200 }).notNull(),
    intentReference: varchar("intent_reference", { length: 40 }),
    payload: jsonb("payload").notNull().default({}),
    signatureValid: boolean("signature_valid").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_webhook_provider_event").on(t.provider, t.eventId)]
);

/* ============ WALLETS & LEDGER ============ */
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // varchar to support UUID user ids AND system alias "SYSTEM_ADMIN_WALLET"
    ownerId: varchar("owner_id", { length: 100 }).notNull(),
    ownerType: varchar("owner_type", { length: 20 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("SDG"),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    availableBalance: numeric("available_balance", { precision: 18, scale: 2 }).notNull().default("0"),
    pendingBalance: numeric("pending_balance", { precision: 18, scale: 2 }).notNull().default("0"),
    lockedBalance: numeric("locked_balance", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_wallet_owner").on(t.ownerId, t.ownerType, t.currency)]
);

export const walletAccounts = pgTable(
  "wallet_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    accountCode: varchar("account_code", { length: 60 }).notNull().unique(),
    label: varchar("label", { length: 200 }).notNull(),
    balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_waccounts_wallet").on(t.walletId)]
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // varchar to support UUID user ids AND system alias "SYSTEM_ADMIN_WALLET"
    ownerId: varchar("owner_id", { length: 100 }).notNull(),
    ownerType: varchar("owner_type", { length: 20 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("SDG"),
    accountType: varchar("account_type", { length: 20 }).notNull(),
    code: varchar("code", { length: 60 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    balance: numeric("balance", { precision: 18, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_ledger_owner").on(t.ownerId, t.ownerType)]
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    debitAccountId: uuid("debit_account_id").references(() => ledgerAccounts.id),
    creditAccountId: uuid("credit_account_id").references(() => ledgerAccounts.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("SDG"),
    entryType: varchar("entry_type", { length: 40 }).notNull(),
    description: text("description"),
    referenceType: varchar("reference_type", { length: 60 }),
    referenceId: uuid("reference_id"),
    idempotencyKey: varchar("idempotency_key", { length: 150 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_ledger_ref").on(t.referenceType, t.referenceId)]
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 18, scale: 2 }).notNull(),
    referenceType: varchar("reference_type", { length: 60 }),
    referenceId: uuid("reference_id"),
    description: text("description"),
    idempotencyKey: varchar("idempotency_key", { length: 150 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_tx_wallet").on(t.walletId)]
);

export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => users.id),
    productValue: numeric("product_value", { precision: 18, scale: 2 }).notNull(),
    rate: numeric("rate", { precision: 5, scale: 4 }).notNull().default("0.05"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    commissionType: varchar("commission_type", { length: 30 }).notNull().default("standard"),
    status: varchar("status", { length: 30 }).notNull().default("accrued"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_commission_order_type").on(t.orderId, t.commissionType)]
);

/* ============ MERCHANT WITHDRAWALS (managed by Admin) ============ */
export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => users.id),
    storeId: uuid("store_id").references(() => stores.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("SDG"),
    method: varchar("method", { length: 30 }).notNull().default("bankak"),
    accountDetails: varchar("account_details", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    adminNote: text("admin_note"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 150 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_withdrawals_merchant").on(t.merchantId), index("idx_withdrawals_status").on(t.status)]
);

/* ============ SHIPPING, RECEIPTS, AGENTS ============ */
export const shippingZones = pgTable("shipping_zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
  fromState: varchar("from_state", { length: 100 }).notNull(),
  toState: varchar("to_state", { length: 100 }).notNull(),
  fee: numeric("fee", { precision: 18, scale: 2 }).notNull().default("0"),
  estimatedDays: integer("estimated_days").notNull().default(3),
  isNegotiable: boolean("is_negotiable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  serialNumber: varchar("serial_number", { length: 40 }).notNull().unique(),
  verificationToken: varchar("verification_token", { length: 100 }).notNull().unique(),
  receiptHash: varchar("receipt_hash", { length: 200 }).notNull(),
  qrPayload: text("qr_payload").notNull(),
  deliveryCompleted: boolean("delivery_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  receiptData: jsonb("receipt_data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryAgents = pgTable(
  "delivery_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    nationalId: varchar("national_id", { length: 50 }),
    verificationCode: varchar("verification_code", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    deliveriesCount: integer("deliveries_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_agents_store").on(t.storeId)]
);

/* ============ SYSTEM ============ */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    actorRole: varchar("actor_role", { length: 30 }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ip: varchar("ip", { length: 60 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_audit_action").on(t.action), index("idx_audit_entity").on(t.entityType, t.entityId)]
);

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jti: varchar("jti", { length: 100 }).notNull().unique(),
    device: varchar("device", { length: 200 }),
    ip: varchar("ip", { length: 60 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_sessions_user").on(t.userId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleAr: varchar("title_ar", { length: 300 }).notNull(),
    titleEn: varchar("title_en", { length: 300 }),
    bodyAr: text("body_ar"),
    bodyEn: text("body_en"),
    type: varchar("type", { length: 50 }).notNull().default("info"),
    isRead: boolean("is_read").notNull().default(false),
    link: text("link"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_notif_user").on(t.userId)]
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    contact: varchar("contact", { length: 255 }).notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull().default("sms"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    resendCount: integer("resend_count").notNull().default(0),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    deliveryMs: integer("delivery_ms").notNull().default(0),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_otp_contact").on(t.contact), index("idx_otp_user_purpose").on(t.userId, t.purpose)]
);

export const userSecurityQuestions = pgTable(
  "user_security_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionKey: varchar("question_key", { length: 60 }).notNull(),
    questionAr: text("question_ar").notNull(),
    answerHash: text("answer_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_secq_user").on(t.userId)]
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    method: varchar("method", { length: 30 }).notNull().default("security_questions"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_pwreset_user").on(t.userId)]
);

export const improvementProposals = pgTable("improvement_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  level: integer("level").notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  titleAr: varchar("title_ar", { length: 300 }).notNull(),
  descriptionAr: text("description_ar"),
  payload: jsonb("payload").notNull().default({}),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  autoApplied: boolean("auto_applied").notNull().default(false),
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============ CONTACT CHANNELS (WhatsApp / Messenger) ============ */
export const contactChannels = pgTable(
  "contact_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // platform | store | user
    ownerType: varchar("owner_type", { length: 20 }).notNull(),
    // PLATFORM | storeId (uuid) | userId (uuid)
    ownerId: varchar("owner_id", { length: 100 }).notNull(),
    // whatsapp | messenger
    channel: varchar("channel", { length: 20 }).notNull(),
    label: varchar("label", { length: 200 }),
    // whatsapp: digits 249XXXXXXXXX | messenger: https://m.me/username
    value: text("value").notNull(),
    displayMasked: varchar("display_masked", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    isPrimary: boolean("is_primary").notNull().default(false),
    // public | order_only | private
    visibility: varchar("visibility", { length: 20 }).notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_contact_owner").on(t.ownerType, t.ownerId),
    index("idx_contact_channel").on(t.channel),
    index("idx_contact_active").on(t.isActive),
  ]
);

/* ============ MTJ AI ASSISTANT (conversations + support tickets) ============ */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    guestKey: varchar("guest_key", { length: 100 }),
    role: varchar("role", { length: 30 }).notNull().default("buyer"),
    channel: varchar("channel", { length: 30 }).notNull().default("web"),
    status: varchar("status", { length: 30 }).notNull().default("open"),
    escalated: boolean("escalated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ai_conv_user").on(t.userId),
    index("idx_ai_conv_guest").on(t.guestKey),
  ]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    toolsUsed: jsonb("tools_used").notNull().default([]),
    flags: jsonb("flags").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_ai_msg_conv").on(t.conversationId)]
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketNumber: varchar("ticket_number", { length: 30 }).notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    guestKey: varchar("guest_key", { length: 100 }),
    conversationId: uuid("conversation_id").references(() => aiConversations.id, {
      onDelete: "set null",
    }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    category: varchar("category", { length: 40 }).notNull().default("general"),
    severity: varchar("severity", { length: 20 }).notNull().default("normal"),
    status: varchar("status", { length: 30 }).notNull().default("open"),
    subject: varchar("subject", { length: 300 }).notNull(),
    smartSummary: text("smart_summary"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ticket_user").on(t.userId),
    index("idx_ticket_status").on(t.status),
    index("idx_ticket_severity").on(t.severity),
  ]
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    senderRole: varchar("sender_role", { length: 30 }).notNull().default("user"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_ticket_msg_ticket").on(t.ticketId)]
);
