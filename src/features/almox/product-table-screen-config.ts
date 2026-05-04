import {
  DEFAULT_VISIBLE_PRODUCT_COLUMNS,
  ProductColumnId,
  ensureRequiredProductColumnIds,
  normalizeProductColumnIds,
} from "@/features/almox/product-table-columns";

export type ProductTableScreenKey = "dashboard" | "products" | "orders";

export type ProductTableScreenColumnConfig = {
  enabledColumns: ProductColumnId[];
  defaultVisibleColumns: ProductColumnId[];
};

export type ProductTableAdminConfig = Record<
  ProductTableScreenKey,
  ProductTableScreenColumnConfig
>;

export const PRODUCT_TABLE_ADMIN_CONFIG_STORAGE_KEY =
  "product_table_screen_columns";

export const PRODUCT_TABLE_SCREEN_OPTIONS: readonly {
  key: ProductTableScreenKey;
  label: string;
  subtitle: string;
}[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    subtitle: "Tabela principal do painel operacional.",
  },
  {
    key: "products",
    label: "Produtos",
    subtitle: "Consulta detalhada da carteira do hospital.",
  },
  {
    key: "orders",
    label: "Pedidos",
    subtitle: "Pré-visualização da fila de compra.",
  },
] as const;

function buildDefaultScreenColumnConfig(
  enabledColumns: ProductColumnId[],
  defaultVisibleColumns?: ProductColumnId[],
): ProductTableScreenColumnConfig {
  const safeEnabledColumns = ensureRequiredProductColumnIds(enabledColumns);
  return {
    enabledColumns: safeEnabledColumns,
    defaultVisibleColumns: ensureRequiredProductColumnIds(
      (defaultVisibleColumns ?? DEFAULT_VISIBLE_PRODUCT_COLUMNS).filter((id) =>
        safeEnabledColumns.includes(id),
      ),
    ).filter((id) => safeEnabledColumns.includes(id)),
  };
}

export const productTableAdminConfigPadrao: ProductTableAdminConfig = {
  dashboard: buildDefaultScreenColumnConfig([
    "product",
    "code",
    "days",
    "adjustedDays",
    "rawStock",
    "adjustedStock",
    "level",
    "process",
    "action",
    "hospital",
    "observation",
  ]),
  products: buildDefaultScreenColumnConfig([
    "product",
    "code",
    "days",
    "adjustedDays",
    "rawStock",
    "adjustedStock",
    "level",
    "process",
    "action",
    "hospital",
    "observation",
  ]),
  orders: buildDefaultScreenColumnConfig(
    [
      "product",
      "code",
      "days",
      "adjustedDays",
      "rawStock",
      "adjustedStock",
      "level",
      "action",
      "observation",
    ],
    [
      "product",
      "code",
      "days",
      "adjustedDays",
      "rawStock",
      "adjustedStock",
      "level",
      "action",
      "observation",
    ],
  ),
};

export function normalizarProductTableScreenColumnConfig(
  value: unknown,
  fallback: ProductTableScreenColumnConfig,
): ProductTableScreenColumnConfig {
  const rawValue =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  const enabledColumns = ensureRequiredProductColumnIds(
    normalizeProductColumnIds(rawValue?.enabledColumns),
  );
  const safeEnabledColumns =
    enabledColumns.length > 0 ? enabledColumns : [...fallback.enabledColumns];
  const defaultVisibleColumns = ensureRequiredProductColumnIds(
    normalizeProductColumnIds(rawValue?.defaultVisibleColumns).filter((columnId) =>
      safeEnabledColumns.includes(columnId),
    ),
  ).filter((columnId) => safeEnabledColumns.includes(columnId));

  return {
    enabledColumns: safeEnabledColumns,
    defaultVisibleColumns:
      defaultVisibleColumns.length > 0
        ? defaultVisibleColumns
        : fallback.defaultVisibleColumns.filter((columnId) =>
            safeEnabledColumns.includes(columnId),
          ),
  };
}

export function normalizarProductTableAdminConfig(
  value: unknown,
): ProductTableAdminConfig {
  const source =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;

  const rawValue =
    typeof source === "object" && source !== null
      ? (source as Record<string, unknown>)
      : null;

  return PRODUCT_TABLE_SCREEN_OPTIONS.reduce<ProductTableAdminConfig>(
    (accumulator, screen) => {
      accumulator[screen.key] = normalizarProductTableScreenColumnConfig(
        rawValue?.[screen.key],
        productTableAdminConfigPadrao[screen.key],
      );
      return accumulator;
    },
    {
      dashboard: productTableAdminConfigPadrao.dashboard,
      products: productTableAdminConfigPadrao.products,
      orders: productTableAdminConfigPadrao.orders,
    },
  );
}

export function productTableAdminConfigIgual(
  left: ProductTableAdminConfig,
  right: ProductTableAdminConfig,
) {
  return PRODUCT_TABLE_SCREEN_OPTIONS.every((screen) => {
    const leftConfig = left[screen.key];
    const rightConfig = right[screen.key];
    return (
      leftConfig.enabledColumns.join("|") ===
        rightConfig.enabledColumns.join("|") &&
      leftConfig.defaultVisibleColumns.join("|") ===
        rightConfig.defaultVisibleColumns.join("|")
    );
  });
}
