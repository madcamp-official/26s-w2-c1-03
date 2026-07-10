import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/**
 * ERD(trip_and_end_erd.dbml)가 snake_case 컬럼명을 쓰므로, 엔티티는 camelCase
 * 프로퍼티를 그대로 쓰고 이 전략이 DB 컬럼명 변환만 담당한다. 관계 컬럼(FK)은
 * 각 엔티티에서 @JoinColumn({ name })으로 명시하므로 joinColumnName은 명시가
 * 없는 경우의 보조 규칙일 뿐이다.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(targetName: string, userSpecifiedName?: string): string {
    return userSpecifiedName ?? toSnakeCase(targetName);
  }

  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return toSnakeCase(embeddedPrefixes.concat(customName ?? propertyName).join('_'));
  }

  relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(firstTableName: string, secondTableName: string): string {
    return toSnakeCase(`${firstTableName}_${secondTableName}`);
  }

  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toSnakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
