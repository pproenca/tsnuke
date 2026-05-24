// TypeScript convention violations (reversed from AWS CDK TS best practices).

var legacyGlobal = 1; // no-var
export const useLegacy = () => legacyGlobal;

export interface userProfile {
  // pascal-case-types
  id: number;
}

export class databaseConnection {
  // pascal-case-types
  host = "localhost"; // explicit-member-accessibility
  connect() {} // explicit-member-accessibility
}
