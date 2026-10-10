import * as z from 'zod';

import {
  CanonicalIdSchema,
  UtcInstantSchema,
  createCanonicalRecordV1Schema,
  sealCanonicalRecordV1,
  type JsonValue,
  type Sha256HexDigest,
} from '@nutrixx/canonical-schema';
import type {
  AtomicCanonicalRecordRepository,
  CanonicalTransactionResult,
} from '@nutrixx/persistence';

import {
  divideRational,
  rationalFromCanonicalDecimal,
  roundRationalHalfEven,
} from './decimal.js';

import {
  RecipeIdentityRecordV1Schema,
  RecipeIdentityV1Schema,
  RecipeOutputFoodVersionV1Schema,
  RecipeVersionRecordV1Schema,
  RecipeVersionV1Schema,
  type RecipeIdentityV1,
  type RecipeVersionV1,
} from './model.js';

export const RecipeHeadV1Schema = z.strictObject({
  recipeId: CanonicalIdSchema,
  ownerSubjectId: CanonicalIdSchema,
  activeVersion: z.int().positive(),
  activeVersionRecordId: CanonicalIdSchema,
  identityRecordId: CanonicalIdSchema,
});

export const RecipeHeadRecordV1Schema = createCanonicalRecordV1Schema(
  'recipe.head',
  1,
  RecipeHeadV1Schema,
).refine(
  (record) =>
    record.recordId === record.payload.recipeId &&
    record.subjectId === record.payload.ownerSubjectId &&
    record.owningContext === 'recipe-knowledge' &&
    record.logicalVersion === record.payload.activeVersion,
  { message: 'Recipe head envelope is invalid.' },
);

export const PublishRecipeCommandV1Schema = z.strictObject({
  commandId: z.string().trim().min(1).max(200),
  identityRecordId: CanonicalIdSchema,
  versionRecordId: CanonicalIdSchema,
  outputFoodRecordId: CanonicalIdSchema.optional(),
  outputFoodObservationIds: z.array(CanonicalIdSchema).optional(),
  expectedPreviousVersionRecordId: CanonicalIdSchema.optional(),
  identity: RecipeIdentityV1Schema,
  version: RecipeVersionV1Schema,
  publishedAt: UtcInstantSchema,
});

export type PublishRecipeCommandV1 = z.infer<
  typeof PublishRecipeCommandV1Schema
>;

export interface RecipeLedgerV1Options {
  readonly repository: AtomicCanonicalRecordRepository;
  readonly digestSha256Hex: Sha256HexDigest;
}

export interface CurrentRecipeV1 {
  readonly identity: RecipeIdentityV1;
  readonly version: RecipeVersionV1;
  readonly versionRecordId: string;
}

export class RecipeLedgerV1 {
  readonly #repository: AtomicCanonicalRecordRepository;
  readonly #digest: Sha256HexDigest;

  public constructor(options: RecipeLedgerV1Options) {
    this.#repository = options.repository;
    this.#digest = options.digestSha256Hex;
  }

  public async publish(
    input: PublishRecipeCommandV1,
  ): Promise<CanonicalTransactionResult> {
    const command = PublishRecipeCommandV1Schema.parse(input);
    if (command.identity.recipeId !== command.version.recipeId) {
      throw new TypeError('Recipe identity and version must match.');
    }
    if (
      (command.version.outputFood !== undefined) !==
      (command.outputFoodRecordId !== undefined)
    ) {
      throw new TypeError(
        'A published output food requires its own version record.',
      );
    }
    if (
      command.version.outputFood !== undefined &&
      command.outputFoodObservationIds?.length !==
        command.version.outputFood.nutrition.nutrients.length
    ) {
      throw new TypeError(
        'Each output nutrient requires one observation identifier.',
      );
    }
    const existingInput = await this.#repository.getById(
      command.identity.recipeId,
    );
    const existing =
      existingInput === null
        ? null
        : RecipeHeadRecordV1Schema.parse(existingInput);
    const expectedVersion = (existing?.payload.activeVersion ?? 0) + 1;
    if (command.version.version !== expectedVersion) {
      throw new TypeError(`Recipe version ${expectedVersion} is required.`);
    }
    if (
      existing === null
        ? command.expectedPreviousVersionRecordId !== undefined
        : command.expectedPreviousVersionRecordId !==
          existing.payload.activeVersionRecordId
    ) {
      throw new TypeError('The recipe update is based on a stale version.');
    }
    if (
      existing !== null &&
      (existing.payload.ownerSubjectId !== command.identity.ownerSubjectId ||
        existing.payload.identityRecordId !== command.identityRecordId)
    ) {
      throw new TypeError('Recipe ownership and identity are immutable.');
    }
    if (existing !== null) {
      const previousInput = await this.#repository.getById(
        existing.payload.activeVersionRecordId,
      );
      if (previousInput === null) {
        throw new TypeError('The previous recipe version is unavailable.');
      }
      const previous = RecipeVersionRecordV1Schema.parse(previousInput).payload;
      if (
        previous.outputFood !== undefined &&
        command.version.outputFood?.foodId !== previous.outputFood.foodId
      ) {
        throw new TypeError(
          'A recipe output food keeps one identity across versions.',
        );
      }
    }

    const provenance = {
      method: 'user-entered' as const,
      source: {
        kind: 'user' as const,
        sourceId: command.identity.ownerSubjectId,
      },
      recordedAt: command.publishedAt,
    };
    const versionRecord = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'recipe.version',
        recordVersion: 1,
        recordId: command.versionRecordId,
        subjectId: command.identity.ownerSubjectId,
        owningContext: 'recipe-knowledge',
        logicalVersion: command.version.version,
        createdAt: command.publishedAt,
        updatedAt: command.publishedAt,
        ...(existing === null
          ? {}
          : { correctionOf: existing.payload.activeVersionRecordId }),
        provenance,
        payload: command.version as unknown as JsonValue,
      },
      this.#digest,
    );
    const headRecord = await sealCanonicalRecordV1(
      {
        format: 'nutrixx.canonical-record',
        schemaVersion: 1,
        recordType: 'recipe.head',
        recordVersion: 1,
        recordId: command.identity.recipeId,
        subjectId: command.identity.ownerSubjectId,
        owningContext: 'recipe-knowledge',
        logicalVersion: command.version.version,
        createdAt: existing?.createdAt ?? command.identity.createdAt,
        updatedAt: command.publishedAt,
        provenance,
        payload: {
          recipeId: command.identity.recipeId,
          ownerSubjectId: command.identity.ownerSubjectId,
          activeVersion: command.version.version,
          activeVersionRecordId: command.versionRecordId,
          identityRecordId: command.identityRecordId,
        },
      },
      this.#digest,
    );
    const mutations = [
      { kind: 'put' as const, record: headRecord },
      { kind: 'put' as const, record: versionRecord },
    ];
    if (command.version.outputFood && command.outputFoodRecordId) {
      const foodId = command.version.outputFood.foodId;
      const revision = command.version.version;
      const sourceId = foodId;
      const servingWeight = roundRationalHalfEven(
        divideRational(
          rationalFromCanonicalDecimal(
            command.version.yield.finalEdibleGramWeight,
          ),
          rationalFromCanonicalDecimal(command.version.yield.servings),
        ),
        12,
      );
      const outputFood = RecipeOutputFoodVersionV1Schema.parse({
        foodId: command.version.outputFood.foodId,
        ownerSubjectId: command.identity.ownerSubjectId,
        revision: command.version.version,
        recipeId: command.version.recipeId,
        recipeVersion: command.version.version,
        catalog: {
          format: 'nutrixx.food-catalog',
          schemaVersion: 1,
          sources: [
            {
              sourceId,
              provider: 'nutrixx',
              dataset: 'user-recipe-output',
              sourceRelease: `recipe-version-${revision}`,
              sourceRecordId: `${command.version.recipeId}:${revision}`,
              licenseId: 'user-authored',
              retrievedAt: command.publishedAt,
            },
          ],
          foods: [
            {
              foodId,
              revision,
              foodClass: 'recipe-output',
              descriptions: command.version.names,
              categories: [{ locale: 'en', description: 'Recipes' }],
              preparationStates: ['prepared'],
              sourceId,
            },
          ],
          portions: [
            {
              portionId: command.outputFoodRecordId,
              foodId,
              foodRevision: revision,
              description: {
                locale: 'en',
                value: '1 serving',
                kind: 'primary',
              },
              amount: '1',
              measureUnit: { system: 'nutrixx', code: 'serving' },
              gramWeight: servingWeight,
              edibleFraction: '1',
              sourceId,
            },
          ],
          composition: command.version.outputFood.nutrition.nutrients.map(
            (nutrient, index) => ({
              observationId: command.outputFoodObservationIds![index],
              foodId,
              foodRevision: revision,
              nutrientId: nutrient.nutrientId,
              sourceNutrientId: nutrient.nutrientId,
              sourceNutrientName: nutrient.nutrientId,
              preparationState: 'prepared',
              value:
                nutrient.state === 'known'
                  ? {
                      state: 'known',
                      amount: nutrient.per100Gram.amount,
                      unit: nutrient.per100Gram.unit,
                      basis: 'per-100-gram-edible',
                    }
                  : { state: 'unknown', reason: 'not-resolvable' },
              sourceId,
              quality: [],
            }),
          ),
        },
        nutrition: command.version.outputFood.nutrition,
        publishedAt: command.publishedAt,
      });
      const outputFoodRecord = await sealCanonicalRecordV1(
        {
          format: 'nutrixx.canonical-record',
          schemaVersion: 1,
          recordType: 'food.recipe-output-version',
          recordVersion: 1,
          recordId: command.outputFoodRecordId,
          subjectId: command.identity.ownerSubjectId,
          owningContext: 'food-knowledge',
          logicalVersion: command.version.version,
          createdAt: command.publishedAt,
          updatedAt: command.publishedAt,
          provenance,
          payload: outputFood as unknown as JsonValue,
        },
        this.#digest,
      );
      mutations.push({ kind: 'put', record: outputFoodRecord });
    }
    if (existing === null) {
      const identityRecord = await sealCanonicalRecordV1(
        {
          format: 'nutrixx.canonical-record',
          schemaVersion: 1,
          recordType: 'recipe.identity',
          recordVersion: 1,
          recordId: command.identityRecordId,
          subjectId: command.identity.ownerSubjectId,
          owningContext: 'recipe-knowledge',
          logicalVersion: 1,
          createdAt: command.identity.createdAt,
          updatedAt: command.identity.createdAt,
          provenance,
          payload: command.identity as unknown as JsonValue,
        },
        this.#digest,
      );
      mutations.push({ kind: 'put', record: identityRecord });
    }
    return this.#repository.commit({
      commandId: command.commandId,
      occurredAt: command.publishedAt,
      mutations,
    });
  }

  public async listCurrent(
    ownerSubjectId: string,
  ): Promise<readonly CurrentRecipeV1[]> {
    const records = await this.#repository.listBySubject(ownerSubjectId);
    const heads = records.flatMap((record) => {
      const result = RecipeHeadRecordV1Schema.safeParse(record);
      return result.success ? [result.data.payload] : [];
    });
    const recipes = await Promise.all(
      heads.map(async (head) => {
        const [identityInput, versionInput] = await Promise.all([
          this.#repository.getById(head.identityRecordId),
          this.#repository.getById(head.activeVersionRecordId),
        ]);
        if (identityInput === null || versionInput === null) return null;
        return {
          identity: RecipeIdentityRecordV1Schema.parse(identityInput).payload,
          version: RecipeVersionRecordV1Schema.parse(versionInput).payload,
          versionRecordId: head.activeVersionRecordId,
        };
      }),
    );
    return recipes
      .filter((recipe): recipe is CurrentRecipeV1 => recipe !== null)
      .sort((left, right) =>
        (left.version.names[0]?.value ?? '').localeCompare(
          right.version.names[0]?.value ?? '',
          'en',
        ),
      );
  }

  public async history(
    ownerSubjectId: string,
    recipeId: string,
  ): Promise<readonly RecipeVersionV1[]> {
    return (await this.#repository.listBySubject(ownerSubjectId))
      .flatMap((record) => {
        const result = RecipeVersionRecordV1Schema.safeParse(record);
        return result.success && result.data.payload.recipeId === recipeId
          ? [result.data.payload]
          : [];
      })
      .sort((left, right) => left.version - right.version);
  }
}
