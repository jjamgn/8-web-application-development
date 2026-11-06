type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(part => matches(row, part));
    if (key === 'OR') return value.some((part: Row) => matches(row, part));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, operand]: [string, any]) => {
        if (operator === 'gt') return row[key] > operand;
        if (operator === 'gte') return row[key] >= operand;
        if (operator === 'lt') return row[key] < operand;
        if (operator === 'lte') return row[key] <= operand;
        if (operator === 'in') return operand.includes(row[key]);
        if (operator === 'not') return row[key] !== operand;
        throw new Error(`Unsupported fixture filter ${operator}`);
      });
    }
    return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
  });
}

function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : structuredClone(value);
}

function stubModel(prisma: any, name: string, primaryKey: string) {
  const rows = new Map<string, Row>();
  prisma[name].findUnique = async ({where}: Row) => {
    const row = [...rows.values()].find(row => matches(row, where));
    return row ? structuredClone(row) : null;
  };
  prisma[name].create = async ({data}: Row) => {
    if (rows.has(data[primaryKey])) throw Object.assign(new Error('Duplicate primary key'), {code: 'P2002'});
    const row = structuredClone(data);
    rows.set(row[primaryKey], row);
    return structuredClone(row);
  };
  prisma[name].upsert = async ({where, create, update}: Row) => {
    let row = [...rows.values()].find(row => matches(row, where));
    if (row) apply(row, update);
    else { row = structuredClone(create); rows.set(row![primaryKey], row!); }
    return structuredClone(row);
  };
  prisma[name].updateMany = async ({where, data}: Row) => {
    const selected = [...rows.values()].filter(row => matches(row, where));
    selected.forEach(row => apply(row, data));
    return {count: selected.length};
  };
  prisma[name].deleteMany = async ({where}: Row = {}) => {
    const selected = [...rows.entries()].filter(([, row]) => matches(row, where));
    selected.forEach(([key]) => rows.delete(key));
    return {count: selected.length};
  };
  return rows;
}

/** An isolated, database-shaped store shared by all application/store instances in a test. */
export const stubSession = (prisma: any) => stubModel(prisma, 'session', 'sid');
export const stubLoginAttempts = (prisma: any) => stubModel(prisma, 'loginAttempt', 'key');
