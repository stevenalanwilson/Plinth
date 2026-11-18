export interface Account {
  readonly id: string;
  /** Always lower case: see normaliseEmail. */
  readonly email: string;
  readonly createdAt: Date;
}

export interface AccountLookup {
  readonly account: Account;
  /** True when the lookup made the account. */
  readonly created: boolean;
}

/** People who have proved they can read an email address. Times are passed in, not read. */
export interface AccountRepository {
  /**
   * The account for this email, made if there isn't one. `created` says which, so a first
   * sign-in can be told from a return. Two calls at once for a new email make one account.
   */
  findOrCreateByEmail(email: string, now: Date): Promise<AccountLookup>;
  findById(id: string): Promise<Account | null>;
  /** Removes the account, returning whether there was one. */
  delete(id: string): Promise<boolean>;
}
