import {
  RecipeIdentityV1Schema,
  RecipeVersionV1Schema,
  type RecipeIdentityV1,
  type RecipeVersionV1,
} from './model.js';

export interface RecipeKnowledgeRepositoryV1 {
  registerIdentity(identity: RecipeIdentityV1): void;
  publishVersion(version: RecipeVersionV1): void;
  getIdentity(recipeId: string): RecipeIdentityV1 | null;
  getVersion(recipeId: string, version: number): RecipeVersionV1 | null;
  listVersions(recipeId: string): readonly RecipeVersionV1[];
}

export class InMemoryRecipeBookV1 implements RecipeKnowledgeRepositoryV1 {
  readonly #identities = new Map<string, RecipeIdentityV1>();
  readonly #versions = new Map<string, Map<number, RecipeVersionV1>>();

  public registerIdentity(identityInput: RecipeIdentityV1): void {
    const identity = RecipeIdentityV1Schema.parse(identityInput);
    if (this.#identities.has(identity.recipeId)) {
      throw new TypeError('The recipe identity is already registered.');
    }
    this.#identities.set(identity.recipeId, structuredClone(identity));
    this.#versions.set(identity.recipeId, new Map());
  }

  public publishVersion(versionInput: RecipeVersionV1): void {
    const version = RecipeVersionV1Schema.parse(versionInput);
    if (!this.#identities.has(version.recipeId)) {
      throw new TypeError('The recipe identity must exist before publication.');
    }
    const versions = this.#versions.get(version.recipeId);
    if (versions === undefined) {
      throw new Error('The recipe version registry is unavailable.');
    }
    const identity = this.#identities.get(version.recipeId);
    if (
      identity !== undefined &&
      Date.parse(version.publishedAt) < Date.parse(identity.createdAt)
    ) {
      throw new TypeError('A recipe version cannot precede its identity.');
    }
    const latestVersion = Math.max(0, ...versions.keys());
    if (version.version !== latestVersion + 1) {
      throw new TypeError(
        `Recipe version ${latestVersion + 1} is required for the next publication.`,
      );
    }
    const latest = versions.get(latestVersion);
    if (
      latest !== undefined &&
      Date.parse(version.publishedAt) < Date.parse(latest.publishedAt)
    ) {
      throw new TypeError('Recipe publication time must remain monotonic.');
    }
    for (const ingredient of version.ingredients) {
      if (ingredient.reference.kind !== 'recipe') continue;
      if (
        this.getVersion(
          ingredient.reference.recipeId,
          ingredient.reference.recipeVersion,
        ) === null
      ) {
        throw new TypeError(
          'Every recipe ingredient must reference an available exact version.',
        );
      }
    }
    versions.set(version.version, structuredClone(version));
  }

  public getIdentity(recipeId: string): RecipeIdentityV1 | null {
    const identity = this.#identities.get(recipeId);
    return identity === undefined ? null : structuredClone(identity);
  }

  public getVersion(recipeId: string, version: number): RecipeVersionV1 | null {
    const recipe = this.#versions.get(recipeId)?.get(version);
    return recipe === undefined ? null : structuredClone(recipe);
  }

  public listVersions(recipeId: string): readonly RecipeVersionV1[] {
    return [...(this.#versions.get(recipeId)?.values() ?? [])]
      .sort((left, right) => left.version - right.version)
      .map((version) => structuredClone(version));
  }
}
