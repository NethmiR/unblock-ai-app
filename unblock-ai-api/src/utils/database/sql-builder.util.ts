export class SqlParameters {
  private readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  toArray(): unknown[] {
    return [...this.values];
  }
}

export class SqlWhereBuilder {
  private readonly conditions: string[] = [];

  constructor(private readonly parameters: SqlParameters) {}

  where(condition: string): this {
    this.conditions.push(condition);
    return this;
  }

  parameter(value: unknown): string {
    return this.parameters.add(value);
  }

  toSql(): string {
    return this.conditions.length === 0 ? "" : `WHERE ${this.conditions.join(" AND ")}`;
  }
}

export class SqlAssignmentBuilder {
  private readonly assignments: string[] = [];

  constructor(private readonly parameters: SqlParameters) {}

  set(column: string, value: unknown): this {
    this.assignments.push(`${column} = ${this.parameters.add(value)}`);
    return this;
  }

  setExpression(column: string, expression: string): this {
    this.assignments.push(`${column} = ${expression}`);
    return this;
  }

  toSql(): string {
    return this.assignments.join(", ");
  }
}

export function toContainsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
