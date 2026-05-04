export type ProductColumnId =
  | "product"
  | "code"
  | "days"
  | "adjustedDays"
  | "rawStock"
  | "adjustedStock"
  | "cmm"
  | "score"
  | "level"
  | "risk"
  | "process"
  | "action"
  | "hospital"
  | "postAction"
  | "observation";

export type ProductColumnDefinition = {
  id: ProductColumnId;
  label: string;
  width: number;
  required?: boolean;
  defaultVisible?: boolean;
};

export type ProductTableColumnSetConfig = {
  enabledColumns?: ProductColumnId[];
  defaultVisibleColumns?: ProductColumnId[];
};

export const PRODUCT_TABLE_COLUMN_OPTIONS: readonly ProductColumnDefinition[] =
  [
    {
      id: "product",
      label: "Produto",
      width: 300,
      required: true,
      defaultVisible: true,
    },
    {
      id: "code",
      label: "Código",
      width: 60,
      defaultVisible: true,
    },
    {
      id: "days",
      label: "Dias",
      width: 50,
      defaultVisible: true,
    },
    {
      id: "adjustedDays",
      label: "Dias ajust.",
      width: 90,
      defaultVisible: true,
    },
    {
      id: "rawStock",
      label: "EAT",
      width: 90,
      defaultVisible: true,
    },
    {
      id: "adjustedStock",
      label: "EAT ajust.",
      width: 90,
      defaultVisible: true,
    },
    {
      id: "cmm",
      label: "CMM",
      width: 90,
      defaultVisible: false,
    },
    {
      id: "score",
      label: "Score",
      width: 110,
      defaultVisible: false,
    },
    {
      id: "level",
      label: "Nível",
      width: 110,
      defaultVisible: true,
    },
    {
      id: "risk",
      label: "Risco futuro",
      width: 170,
      defaultVisible: false,
    },
    {
      id: "process",
      label: "Processos",
      width: 150,
      defaultVisible: true,
    },
    {
      id: "action",
      label: "Ação",
      width: 180,
      defaultVisible: true,
    },
    {
      id: "hospital",
      label: "Hospital compatível",
      width: 220,
      defaultVisible: true,
    },
    {
      id: "postAction",
      label: "Pós-ação",
      width: 110,
      defaultVisible: false,
    },
    {
      id: "observation",
      label: "Obs. operacional",
      width: 360,
      defaultVisible: true,
    },
  ] as const;

export const DEFAULT_VISIBLE_PRODUCT_COLUMNS =
  PRODUCT_TABLE_COLUMN_OPTIONS.filter(
    (column) => column.defaultVisible !== false,
  ).map((column) => column.id);

export const REQUIRED_PRODUCT_COLUMNS = PRODUCT_TABLE_COLUMN_OPTIONS.filter(
  (column) => column.required,
).map((column) => column.id);

export function normalizeProductColumnIds(value: unknown) {
  const validIds = new Set<ProductColumnId>(
    PRODUCT_TABLE_COLUMN_OPTIONS.map((column) => column.id),
  );
  const uniqueIds = new Set<ProductColumnId>();
  const normalizedIds: ProductColumnId[] = [];

  if (!Array.isArray(value)) {
    return normalizedIds;
  }

  for (const rawId of value) {
    if (typeof rawId !== "string") {
      continue;
    }

    const columnId = rawId as ProductColumnId;
    if (!validIds.has(columnId) || uniqueIds.has(columnId)) {
      continue;
    }

    uniqueIds.add(columnId);
    normalizedIds.push(columnId);
  }

  return normalizedIds;
}

export function ensureRequiredProductColumnIds(columnIds: ProductColumnId[]) {
  const uniqueIds = new Set(columnIds);

  for (const requiredId of REQUIRED_PRODUCT_COLUMNS) {
    uniqueIds.add(requiredId);
  }

  return PRODUCT_TABLE_COLUMN_OPTIONS.map((column) => column.id).filter((id) =>
    uniqueIds.has(id),
  );
}
